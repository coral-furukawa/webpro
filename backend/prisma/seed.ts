import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";

config({ path: [".env", "../.env"] });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URLを設定してください");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const demoEmail = "market-demo@example.invalid";

const listings = [
  {
    title: "マンキュー入門経済学 第3版",
    price: 1800,
    type: "TEXTBOOK" as const,
    condition: "GOOD" as const,
    description: "授業で使用しました。表紙に少し擦れがありますが、書き込みはほとんどありません。",
    handoffPlace: "三田キャンパス 西校舎前",
    handoffTime: "平日12:00〜16:00",
    courseName: "経済学基礎",
    faculty: "経済学部",
    department: "経済学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "民法判例百選 I 総則・物権",
    price: 1400,
    type: "TEXTBOOK" as const,
    condition: "FAIR" as const,
    description: "重要箇所に数ページだけマーカーがあります。授業の予習・復習に便利です。",
    handoffPlace: "三田キャンパス 図書館入口",
    handoffTime: "火・木曜の昼休み",
    courseName: "民法総論",
    faculty: "法学部",
    department: "法律学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "線形代数キャンパス・ゼミ",
    price: 900,
    type: "TEXTBOOK" as const,
    condition: "LIKE_NEW" as const,
    description: "購入後ほとんど使わなかったため、きれいな状態です。別冊解答もあります。",
    handoffPlace: "矢上キャンパス 14棟前",
    handoffTime: "月〜金曜の放課後",
    courseName: "線形代数学",
    faculty: "理工学部",
    department: "情報工学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "基礎から学ぶ統計学 授業ノート",
    price: 500,
    type: "NOTES" as const,
    condition: "GOOD" as const,
    description: "全14回分を整理したノートです。公式の使い分けと試験前の要点をまとめています。",
    handoffPlace: "日吉キャンパス 独立館前",
    handoffTime: "水・金曜 3限後",
    courseName: "統計学入門",
    faculty: "商学部",
    department: "商学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "心理学 第5版",
    price: 1200,
    type: "TEXTBOOK" as const,
    condition: "GOOD" as const,
    description: "カバー付きです。後半に鉛筆で少しメモがありますが、読むのに支障はありません。",
    handoffPlace: "日吉キャンパス メディアセンター前",
    handoffTime: "平日のお昼休み",
    courseName: "心理学概論",
    faculty: "文学部",
    department: "人文社会学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=85",
  },
  {
    title: "Pythonデータ分析演習ノート",
    price: 700,
    type: "NOTES" as const,
    condition: "LIKE_NEW" as const,
    description: "サンプルコードと課題のポイントを回ごとに整理しています。個人情報は含みません。",
    handoffPlace: "湘南藤沢キャンパス θ館前",
    handoffTime: "火・木曜 4限後",
    courseName: "データサイエンス基礎",
    faculty: "環境情報学部",
    department: "環境情報学科",
    instructor: "デモ担当",
    imageUrl: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=85",
  },
];

async function main() {
  const seller = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { name: "デモ出品者", faculty: "経済学部", department: "経済学科", grade: 3, gpa: 3.42 },
    create: { email: demoEmail, name: "デモ出品者", faculty: "経済学部", department: "経済学科", grade: 3, gpa: 3.42 },
  });

  await prisma.item.deleteMany({ where: { sellerId: seller.id } });

  for (const listing of listings) {
    const course = await prisma.course.findFirst({
      where: { courseName: listing.courseName, faculty: listing.faculty, instructor: listing.instructor },
    }) ?? await prisma.course.create({
      data: {
        courseName: listing.courseName,
        faculty: listing.faculty,
        department: listing.department,
        instructor: listing.instructor,
      },
    });

    await prisma.item.create({
      data: {
        title: listing.title,
        price: listing.price,
        type: listing.type,
        condition: listing.condition,
        description: listing.description,
        handoffPlace: listing.handoffPlace,
        handoffTime: listing.handoffTime,
        imageUrl: listing.imageUrl,
        sellerId: seller.id,
        courseId: course.id,
        images: { create: [{ url: listing.imageUrl, position: 0 }] },
      },
    });
  }

  console.log(`デモ出品を${listings.length}件登録しました。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
