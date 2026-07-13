import { config } from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { createServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { v2 as cloudinary } from "cloudinary";

config({ path: [".env", "../.env"] });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const app = express();
const httpServer = createServer(app);
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
const io = new Server(httpServer, { cors: { origin: frontendUrl, credentials: true } });
const port = Number(process.env.PORT ?? 8888);
const jwtSecret = process.env.JWT_SECRET ?? "development-only-change-me";
const isProduction = process.env.NODE_ENV === "production";
const authCookieName = "keio_session";
const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "keio.jp").split(",").map((domain) => domain.trim().toLowerCase());
const uploadsDirectory = resolve("uploads");
const cloudinaryEnabled = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (isProduction && jwtSecret === "development-only-change-me") throw new Error("本番環境ではJWT_SECRETが必須です");
if (cloudinaryEnabled) cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });

mkdirSync(uploadsDirectory, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.mimetype));
  },
});

app.use(express.json());
app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (isProduction && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin !== frontendUrl) {
    return res.status(403).json({ error: "許可されていない送信元です" });
  }
  next();
});
app.use("/uploads", express.static(uploadsDirectory));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "試行回数が多すぎます。しばらくしてからお試しください" } });

async function saveImages(files: Express.Multer.File[], folder: string) {
  return Promise.all(files.map(async (file) => {
    if (cloudinaryEnabled) {
      return new Promise<string>((resolveUpload, rejectUpload) => {
        const stream = cloudinary.uploader.upload_stream({ folder: `keio-textbooks/${folder}`, resource_type: "image" }, (error, result) => {
          if (error || !result) rejectUpload(error ?? new Error("画像アップロードに失敗しました"));
          else resolveUpload(result.secure_url);
        });
        stream.end(file.buffer);
      });
    }
    const filename = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await writeFile(resolve(uploadsDirectory, filename), file.buffer);
    return `/uploads/${filename}`;
  }));
}

function createToken(userId: number) {
  return jwt.sign({ userId }, jwtSecret, { expiresIn: "7d" });
}

function setAuthCookie(res: express.Response, userId: number) {
  res.cookie(authCookieName, createToken(userId), { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.[authCookieName];
  try {
    const payload = jwt.verify(token ?? "", jwtSecret) as { userId: number };
    res.locals.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "ログインの有効期限が切れました" });
  }
}

const allowedSorts = ["newest", "gpa_desc", "gpa_asc", "price_asc", "price_desc"] as const;
type ItemSort = (typeof allowedSorts)[number];

function optionalInt(value: unknown, field: string) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${field} は整数で指定してください`);
  }
  return Number(value);
}

app.get("/", (_req, res) => {
  res.json({
    name: "慶應生向け教科書売買 API",
    status: "running",
    frontend: "http://localhost:5173",
    endpoints: {
      health: "GET /health",
      items: "GET /items",
      courses: "GET /courses",
      createItem: "POST /items",
      likes: "POST /likes",
      demands: "POST /demands",
    },
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/courses", async (req, res, next) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const courses = await prisma.course.findMany({
      where: query
        ? { OR: [{ courseName: { contains: query, mode: "insensitive" } }, { instructor: { contains: query, mode: "insensitive" } }] }
        : undefined,
      orderBy: { courseName: "asc" },
      include: { _count: { select: { items: true, demands: true } } },
    });
    res.json({ courses });
  } catch (error) { next(error); }
});

app.get("/users/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ユーザーIDが不正です" });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, faculty: true, department: true, grade: true, gpa: true, avatarUrl: true,
        items: {
          orderBy: { createdAt: "desc" }, take: 6,
          select: { id: true, title: true, price: true, imageUrl: true, images: { orderBy: { position: "asc" } }, status: true, course: { select: { courseName: true } } },
        },
        receivedReviews: { select: { rating: true } },
        _count: { select: { items: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "ユーザーが見つかりません" });

    const completedTransactions = await prisma.transaction.count({
      where: { item: { sellerId: id }, status: "COMPLETED" },
    });
    const averageRating = user.receivedReviews.length
      ? user.receivedReviews.reduce((sum, review) => sum + review.rating, 0) / user.receivedReviews.length
      : null;
    const { receivedReviews, _count, ...publicUser } = user;
    res.json({
      user: publicUser,
      stats: { listings: _count.items, completedTransactions, averageRating, reviewCount: receivedReviews.length },
    });
  } catch (error) { next(error); }
});

app.post("/auth/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password, name, faculty, department } = req.body;
    const grade = Number(req.body.grade);
    if (!email || !name || !faculty || !department || !Number.isInteger(grade) || grade < 1 || grade > 6 || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "プロフィールと8文字以上のパスワードを入力してください" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const emailDomain = normalizedEmail.split("@")[1] ?? "";
    if (!allowedEmailDomains.some((domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`))) {
      return res.status(400).json({ error: "慶應義塾のメールアドレスを使用してください" });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.passwordHash) return res.status(409).json({ error: "このメールアドレスは登録済みです" });
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: { name: String(name).trim(), faculty, department, grade, passwordHash },
      create: { email: normalizedEmail, name: String(name).trim(), faculty, department, grade, passwordHash },
      select: { id: true, name: true, faculty: true, department: true, grade: true, avatarUrl: true },
    });
    setAuthCookie(res, user.id);
    res.json({ user });
  } catch (error) { next(error); }
});

app.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const now = new Date();
    const loginAttempt = await prisma.loginAttempt.findUnique({ where: { email } });
    if (loginAttempt?.lockedUntil && loginAttempt.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((loginAttempt.lockedUntil.getTime() - now.getTime()) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ error: `ログインに3回失敗したためロック中です。約${Math.ceil(retryAfterSeconds / 60)}分後にもう一度お試しください` });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await compare(password, user.passwordHash))) {
      const previousAttempts = loginAttempt?.lockedUntil && loginAttempt.lockedUntil <= now ? 0 : loginAttempt?.attempts ?? 0;
      const attempts = previousAttempts + 1;
      const lockedUntil = attempts >= 3 ? new Date(now.getTime() + 15 * 60 * 1000) : null;
      await prisma.loginAttempt.upsert({
        where: { email }, update: { attempts, lockedUntil }, create: { email, attempts, lockedUntil },
      });
      if (lockedUntil) {
        res.setHeader("Retry-After", 15 * 60);
        return res.status(429).json({ error: "3回失敗したため、15分間ログインできません" });
      }
      return res.status(401).json({ error: `メールアドレスまたはパスワードが違います。あと${3 - attempts}回失敗すると15分間ロックされます` });
    }
    await prisma.loginAttempt.deleteMany({ where: { email } });
    setAuthCookie(res, user.id);
    res.json({ user: { id: user.id, name: user.name, faculty: user.faculty, department: user.department, grade: user.grade, avatarUrl: user.avatarUrl } });
  } catch (error) { next(error); }
});

app.post("/auth/refresh", authenticate, (_req, res) => {
  setAuthCookie(res, Number(res.locals.userId));
  res.status(204).send();
});

app.get("/auth/me", authenticate, async (_req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(res.locals.userId) },
      select: { id: true, name: true, faculty: true, department: true, grade: true, avatarUrl: true },
    });
    if (!user) return res.status(401).json({ error: "ユーザーが見つかりません" });
    res.json({ user });
  } catch (error) { next(error); }
});

app.post("/auth/logout", (_req, res) => {
  res.clearCookie(authCookieName, { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", path: "/" });
  res.status(204).send();
});

app.put("/users/me/avatar", authenticate, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "プロフィール画像を選択してください" });
    const [avatarUrl] = await saveImages([req.file], "avatars");
    const user = await prisma.user.update({
      where: { id: Number(res.locals.userId) },
      data: { avatarUrl },
      select: { id: true, name: true, faculty: true, department: true, grade: true, avatarUrl: true },
    });
    res.json({ user });
  } catch (error) { next(error); }
});

app.delete("/users/:id", authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = String(req.body.password ?? "");
    const confirmation = String(req.body.confirmation ?? "");
    if (!Number.isInteger(id) || confirmation !== "削除") {
      return res.status(400).json({ error: "確認欄に「削除」と入力してください" });
    }
    if (id !== Number(res.locals.userId)) return res.status(403).json({ error: "本人のアカウントだけ削除できます" });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.passwordHash || !(await compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "パスワードが違います" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.review.deleteMany({ where: { OR: [{ reviewerId: id }, { revieweeId: id }] } });
      await tx.transaction.deleteMany({ where: { buyerId: id } });
      await tx.user.delete({ where: { id } });
    });
    res.status(204).send();
  } catch (error) { next(error); }
});

app.post("/chat-rooms", authenticate, async (req, res, next) => {
  try {
    const itemId = Number(req.body.itemId);
    const buyerId = Number(res.locals.userId);
    if (!Number.isInteger(itemId) || !Number.isInteger(buyerId)) return res.status(400).json({ error: "商品と購入者が不正です" });
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { sellerId: true, title: true } });
    if (!item) return res.status(404).json({ error: "商品が見つかりません" });
    if (item.sellerId === buyerId) return res.status(400).json({ error: "自分の商品には購入相談できません" });
    const room = await prisma.chatRoom.upsert({
      where: { itemId_buyerId: { itemId, buyerId } },
      update: {},
      create: { itemId, buyerId, sellerId: item.sellerId },
      include: { item: { select: { id: true, title: true } }, buyer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } } },
    });
    res.status(201).json({ room });
  } catch (error) { next(error); }
});

app.get("/chat-rooms", authenticate, async (_req, res, next) => {
  try {
    const userId = Number(res.locals.userId);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "ユーザーが不正です" });
    const rooms = await prisma.chatRoom.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { updatedAt: "desc" },
      include: {
        item: { select: { id: true, title: true, imageUrl: true } },
        buyer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } },
        _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
      },
    });
    res.json({ rooms });
  } catch (error) { next(error); }
});

app.get("/chat-rooms/:id/messages", authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(res.locals.userId);
    const room = await prisma.chatRoom.findUnique({
      where: { id },
      include: { item: { select: { id: true, title: true } }, buyer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true } } } } },
    });
    if (!room) return res.status(404).json({ error: "チャットが見つかりません" });
    if (![room.buyerId, room.sellerId].includes(userId)) return res.status(403).json({ error: "このチャットは閲覧できません" });
    res.json({ room });
  } catch (error) { next(error); }
});

app.post("/chat-rooms/:id/messages", authenticate, async (req, res, next) => {
  try {
    const chatRoomId = Number(req.params.id);
    const senderId = Number(res.locals.userId);
    const content = String(req.body.content ?? "").trim();
    if (!content || content.length > 1000) return res.status(400).json({ error: "メッセージは1〜1000文字で入力してください" });
    const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId } });
    if (!room) return res.status(404).json({ error: "チャットが見つかりません" });
    if (![room.buyerId, room.sellerId].includes(senderId)) return res.status(403).json({ error: "このチャットには送信できません" });
    const message = await prisma.message.create({ data: { chatRoomId, senderId, content }, include: { sender: { select: { id: true, name: true } } } });
    await prisma.chatRoom.update({ where: { id: chatRoomId }, data: { updatedAt: new Date() } });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

app.post("/chat-rooms/:id/images", authenticate, upload.single("image"), async (req, res, next) => {
  try {
    const chatRoomId = Number(req.params.id);
    const senderId = Number(res.locals.userId);
    const content = String(req.body.content ?? "").trim();
    if (!req.file) return res.status(400).json({ error: "送信する画像を選択してください" });
    if (content.length > 1000) return res.status(400).json({ error: "メッセージは1000文字以内で入力してください" });
    const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId } });
    if (!room) return res.status(404).json({ error: "チャットが見つかりません" });
    if (![room.buyerId, room.sellerId].includes(senderId)) return res.status(403).json({ error: "このチャットには送信できません" });

    const [imageUrl] = await saveImages([req.file], "chat");
    const message = await prisma.message.create({
      data: { chatRoomId, senderId, content, imageUrl },
      include: { sender: { select: { id: true, name: true } } },
    });
    await prisma.chatRoom.update({ where: { id: chatRoomId }, data: { updatedAt: new Date() } });
    io.to(`chat:${chatRoomId}`).emit("new-message", message);
    const recipientId = senderId === room.buyerId ? room.sellerId : room.buyerId;
    io.to(`user:${recipientId}`).emit("chat-notification", { roomId: chatRoomId, senderName: message.sender.name, content: content || "写真が届きました" });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

io.use((socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${authCookieName}=`))?.slice(authCookieName.length + 1);
    const payload = jwt.verify(decodeURIComponent(token ?? ""), jwtSecret) as { userId: number };
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  void socket.join(`user:${socket.data.userId}`);
  socket.on("join-room", async (roomId: number, acknowledge?: (result: { ok: boolean }) => void) => {
    const room = await prisma.chatRoom.findUnique({ where: { id: Number(roomId) } });
    const allowed = !!room && [room.buyerId, room.sellerId].includes(socket.data.userId);
    if (allowed) await socket.join(`chat:${roomId}`);
    acknowledge?.({ ok: allowed });
  });

  socket.on("send-message", async (payload: { roomId: number; content: string }, acknowledge?: (result: { ok: boolean; error?: string }) => void) => {
    const content = String(payload.content ?? "").trim();
    const room = await prisma.chatRoom.findUnique({ where: { id: Number(payload.roomId) } });
    if (!room || ![room.buyerId, room.sellerId].includes(socket.data.userId) || !content || content.length > 1000) {
      return acknowledge?.({ ok: false, error: "メッセージを送信できません" });
    }
    const message = await prisma.message.create({
      data: { chatRoomId: room.id, senderId: socket.data.userId, content },
      include: { sender: { select: { id: true, name: true } } },
    });
    await prisma.chatRoom.update({ where: { id: room.id }, data: { updatedAt: new Date() } });
    io.to(`chat:${room.id}`).emit("new-message", message);
    const recipientId = socket.data.userId === room.buyerId ? room.sellerId : room.buyerId;
    io.to(`user:${recipientId}`).emit("chat-notification", { roomId: room.id, senderName: message.sender.name, content: message.content });
    acknowledge?.({ ok: true });
  });

  socket.on("mark-as-read", async (roomId: number) => {
    const room = await prisma.chatRoom.findUnique({ where: { id: Number(roomId) } });
    if (!room || ![room.buyerId, room.sellerId].includes(socket.data.userId)) return;
    const readAt = new Date();
    await prisma.message.updateMany({ where: { chatRoomId: room.id, senderId: { not: socket.data.userId }, readAt: null }, data: { readAt } });
    io.to(`chat:${room.id}`).emit("messages-read", { roomId: room.id, readerId: socket.data.userId, readAt });
  });
});

app.get("/items", async (req, res, next) => {
  try {
    const faculty = typeof req.query.faculty === "string" ? req.query.faculty.trim() : "";
    const department = typeof req.query.department === "string" ? req.query.department.trim() : "";
    const courseName = typeof req.query.courseName === "string" ? req.query.courseName.trim() : "";
    const grade = optionalInt(req.query.grade, "grade");
    const rawSort = req.query.sort ?? "newest";

    if (typeof rawSort !== "string" || !allowedSorts.includes(rawSort as ItemSort)) {
      return res.status(400).json({ error: `sort は ${allowedSorts.join(", ")} から選択してください` });
    }
    if (grade !== undefined && (grade < 1 || grade > 6)) {
      return res.status(400).json({ error: "grade は1〜6で指定してください" });
    }

    const orderBy =
      rawSort === "gpa_desc" ? { seller: { gpa: "desc" as const } }
      : rawSort === "gpa_asc" ? { seller: { gpa: "asc" as const } }
      : rawSort === "price_asc" ? { price: "asc" as const }
      : rawSort === "price_desc" ? { price: "desc" as const }
      : { createdAt: "desc" as const };

    const items = await prisma.item.findMany({
      where: {
        status: "AVAILABLE",
        seller: {
          ...(faculty && { faculty }),
          ...(department && { department }),
          ...(grade !== undefined && { grade }),
        },
        ...(courseName && {
          course: { courseName: { contains: courseName, mode: "insensitive" } },
        }),
      },
      orderBy,
      include: {
        seller: { select: { id: true, name: true, faculty: true, grade: true, gpa: true, avatarUrl: true } },
        course: true,
        images: { orderBy: { position: "asc" } },
        _count: { select: { likes: true } },
      },
    });

    res.json({ items, count: items.length });
  } catch (error) {
    if (error instanceof Error && error.message.includes("整数で指定してください")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

app.post("/items", authenticate, upload.array("images", 10), async (req, res, next) => {
  try {
    const course = typeof req.body.course === "string" ? JSON.parse(req.body.course) : req.body.course;
    const { title, courseId, type, condition, description, handoffPlace, handoffTime } = req.body;
    const price = Number(req.body.price);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!title || !Number.isInteger(price) || price < 0) {
      return res.status(400).json({ error: "商品名と0円以上の価格を指定してください" });
    }
    if (files.length < 1 || files.length > 10) {
      return res.status(400).json({ error: "商品写真を1〜10枚添付してください" });
    }
    const imageUrls = await saveImages(files, "items");
    const imageUrl = imageUrls[0];

    const item = await prisma.$transaction(async (tx) => {
      const resolvedSellerId = Number(res.locals.userId);
      let resolvedCourseId = courseId;

      if (!Number.isInteger(resolvedCourseId)) {
        if (!course?.courseName || !course?.faculty) throw new Error("COURSE_INVALID");
        const existing = await tx.course.findFirst({
          where: { courseName: String(course.courseName).trim(), faculty: course.faculty, instructor: course.instructor || null },
        });
        const savedCourse = existing ?? await tx.course.create({
          data: { courseName: String(course.courseName).trim(), faculty: course.faculty, department: course.department || null, instructor: course.instructor || null },
        });
        resolvedCourseId = savedCourse.id;
      }

      return tx.item.create({
        data: { title: String(title).trim(), price, sellerId: resolvedSellerId, courseId: resolvedCourseId, type, condition, description: description || "", imageUrl, handoffPlace: handoffPlace || null, handoffTime: handoffTime || null, images: { create: imageUrls.map((url, position) => ({ url, position })) } },
        include: { seller: true, course: true, images: { orderBy: { position: "asc" } } },
      });
    });
    res.status(201).json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "COURSE_INVALID") {
      return res.status(400).json({ error: "授業名と学部を入力してください" });
    }
    next(error);
  }
});

app.delete("/items/:id", authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "商品IDが正しくありません" });

    const item = await prisma.item.findUnique({ where: { id }, select: { sellerId: true, status: true } });
    if (!item) return res.status(404).json({ error: "商品が見つかりません" });
    if (item.sellerId !== Number(res.locals.userId)) {
      return res.status(403).json({ error: "出品者本人だけが取り消せます" });
    }
    if (item.status !== "AVAILABLE") {
      return res.status(409).json({ error: "取引中または売却済みの商品は取り消せません" });
    }

    await prisma.item.delete({ where: { id } });
    res.status(204).send();
  } catch (error) { next(error); }
});

app.get("/likes", authenticate, async (_req, res, next) => {
  try {
    const userId = Number(res.locals.userId);
    const likes = await prisma.like.findMany({
      where: { userId },
      orderBy: { id: "desc" },
      include: {
        item: {
          include: {
            seller: { select: { id: true, name: true, faculty: true, grade: true, gpa: true, avatarUrl: true } },
            course: true,
            images: { orderBy: { position: "asc" } },
            _count: { select: { likes: true } },
          },
        },
      },
    });
    res.json({ items: likes.map((like) => like.item) });
  } catch (error) { next(error); }
});

// 同じユーザーがもう一度押すと解除するトグル式いいね
app.post("/likes", authenticate, async (req, res, next) => {
  try {
    const userId = Number(res.locals.userId);
    const itemId = Number(req.body.itemId);
    if (!Number.isInteger(itemId)) {
      return res.status(400).json({ error: "itemId は整数で指定してください" });
    }
    const existing = await prisma.like.findUnique({ where: { userId_itemId: { userId, itemId } } });
    if (existing) {
      await prisma.like.delete({ where: { id: existing.id } });
    } else {
      await prisma.like.create({ data: { userId, itemId } });
    }
    const count = await prisma.like.count({ where: { itemId } });
    res.json({ liked: !existing, count });
  } catch (error) { next(error); }
});

app.post("/demands", authenticate, async (req, res, next) => {
  try {
    const userId = Number(res.locals.userId);
    const courseId = Number(req.body.courseId);
    if (!Number.isInteger(courseId)) {
      return res.status(400).json({ error: "courseId は整数で指定してください" });
    }
    const demand = await prisma.demand.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {},
      create: { userId, courseId },
    });
    const count = await prisma.demand.count({ where: { courseId } });
    res.status(201).json({ demand, count });
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "画像1枚あたり5MBまでです" : "商品写真は10枚まで添付できます";
    return res.status(400).json({ error: message });
  }
  console.error(error);
  res.status(500).json({ error: "サーバーエラーが発生しました" });
});

const server = httpServer.listen(port, () => {
  console.log(`API server: http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
