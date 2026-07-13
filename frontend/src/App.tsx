import { FormEvent, useEffect, useState } from "react";
import { departmentsByFaculty, faculties, type Faculty } from "./keioAcademics";
import { io, type Socket } from "socket.io-client";
import { API_URL, apiFetch, assetUrl } from "./api";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const USER_STORAGE_KEY = "demoUser";
const SESSION_EXPIRY_KEY = "sessionExpiresAt";
const NAVIGATION_STORAGE_KEY = "currentScreen";
type NavigationState =
  | { view: "home" }
  | { view: "listing" }
  | { view: "account"; tab: "profile" | "likes" | "settings" | "delete" }
  | { view: "item"; id: number }
  | { view: "chats" }
  | { view: "chat"; id: number };

function readNavigation(): NavigationState {
  try {
    return JSON.parse(sessionStorage.getItem(NAVIGATION_STORAGE_KEY) ?? "") as NavigationState;
  } catch {
    return { view: "home" };
  }
}
function authHeaders(json = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

type Item = {
  id: number;
  title: string;
  price: number;
  imageUrl?: string;
  images: { id: number; url: string; position: number }[];
  handoffPlace?: string;
  handoffTime?: string;
  description: string;
  type: "TEXTBOOK" | "NOTES" | "OTHER";
  condition: "LIKE_NEW" | "GOOD" | "FAIR" | "POOR";
  seller: {
    id: number;
    name: string;
    faculty: string;
    grade: number;
    gpa: string | null;
  };
  course: { courseName: string };
  _count: { likes: number };
};

type Profile = {
  user: {
    id: number;
    name: string;
    faculty: string;
    department: string | null;
    grade: number;
    gpa: string | null;
    items: {
      id: number;
      title: string;
      price: number;
      imageUrl: string | null;
      images: { url: string }[];
      status: string;
      course: { courseName: string };
    }[];
  };
  stats: {
    listings: number;
    completedTransactions: number;
    averageRating: number | null;
    reviewCount: number;
  };
};

type CurrentUser = {
  id: number;
  name: string;
  faculty: string;
  department: string;
  grade: number;
};
type ChatRoom = {
  id: number;
  item: { id: number; title: string };
  buyer: { id: number; name: string };
  seller: { id: number; name: string };
  messages: {
    id: number;
    content: string;
    imageUrl?: string | null;
    createdAt: string;
    readAt?: string | null;
    sender: { id: number; name: string };
  }[];
};
type ChatSummary = {
  id: number;
  item: { id: number; title: string; imageUrl: string | null };
  buyer: { id: number; name: string };
  seller: { id: number; name: string };
  messages: { content: string; createdAt: string }[];
  _count: { messages: number };
};

export default function App() {
  const [initialNavigation] = useState(readNavigation);
  const [pendingNavigation, setPendingNavigation] = useState<NavigationState | null>(
    ["item", "chats", "chat"].includes(initialNavigation.view)
      ? initialNavigation
      : null,
  );
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showListing, setShowListing] = useState(initialNavigation.view === "listing");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [searchFaculty, setSearchFaculty] = useState<Faculty | "">("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    const expiresAt = Number(localStorage.getItem(SESSION_EXPIRY_KEY));
    if (!expiresAt || expiresAt <= Date.now()) {
      localStorage.removeItem(USER_STORAGE_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      return null;
    }
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [loginFaculty, setLoginFaculty] = useState<Faculty | "">("");
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [chatList, setChatList] = useState<ChatSummary[] | null>(null);
  const [showAccount, setShowAccount] = useState(initialNavigation.view === "account");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<
    "profile" | "likes" | "settings" | "delete"
  >(initialNavigation.view === "account" ? initialNavigation.tab : "profile");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatNotice, setChatNotice] = useState("");
  const [chatImage, setChatImage] = useState<File | null>(null);
  const [chatImagePreview, setChatImagePreview] = useState("");
  const [likedItems, setLikedItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [detailImage, setDetailImage] = useState(0);

  async function search(form?: HTMLFormElement) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (form) {
      new FormData(form).forEach((value, key) =>
        params.set(key, String(value)),
      );
    }
    for (const [key, value] of [...params]) if (!value) params.delete(key);

    try {
      const response = await apiFetch(`/items?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "取得に失敗しました");
      setItems(data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void search();
  }, []);

  useEffect(() => {
    if (!pendingNavigation) return;
    if (pendingNavigation.view === "item" && !loading) {
      setSelectedItem(items.find((item) => item.id === pendingNavigation.id) ?? null);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, loading, items]);

  useEffect(() => {
    if (!currentUser || !pendingNavigation) return;
    if (pendingNavigation.view === "chats") {
      void openChats();
      setPendingNavigation(null);
    } else if (pendingNavigation.view === "chat") {
      void selectChat(pendingNavigation.id);
      setPendingNavigation(null);
    }
  }, [currentUser?.id, pendingNavigation]);

  useEffect(() => {
    if (pendingNavigation) return;
    const navigation: NavigationState = chatRoom
      ? { view: "chat", id: chatRoom.id }
      : chatList
        ? { view: "chats" }
        : showAccount
          ? { view: "account", tab: accountTab }
          : showListing
            ? { view: "listing" }
            : selectedItem
              ? { view: "item", id: selectedItem.id }
              : { view: "home" };
    sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(navigation));
  }, [pendingNavigation, chatRoom?.id, chatList, showAccount, accountTab, showListing, selectedItem?.id]);
  useEffect(() => {
    if (!showLogin) setAuthError("");
  }, [showLogin]);

  useEffect(() => {
    if (!currentUser) return;
    let lastTokenRefresh = 0;
    const extendSession = async () => {
      if (!localStorage.getItem(USER_STORAGE_KEY)) return;
      if (Date.now() - lastTokenRefresh < 5 * 60 * 1000) {
        localStorage.setItem(
          SESSION_EXPIRY_KEY,
          String(Date.now() + SESSION_DURATION),
        );
        return;
      }
      lastTokenRefresh = Date.now();
      const response = await apiFetch("/auth/refresh", {
        method: "POST",
        headers: authHeaders(false),
      });
      if (!response.ok) {
        logout("ログインの有効期限が切れました。もう一度ログインしてください。");
        setShowLogin(true);
        return;
      }
      localStorage.setItem(
        SESSION_EXPIRY_KEY,
        String(Date.now() + SESSION_DURATION),
      );
    };
    const checkSession = () => {
      if (Number(localStorage.getItem(SESSION_EXPIRY_KEY)) <= Date.now())
        logout("一定時間操作がなかったため、自動的にログアウトしました。");
    };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, extendSession, { passive: true }),
    );
    const timer = window.setInterval(checkSession, 30_000);
    return () => {
      events.forEach((event) =>
        window.removeEventListener(event, extendSession),
      );
      window.clearInterval(timer);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      setSocket(null);
      return;
    }
    const connection = API_URL
      ? io(API_URL, { withCredentials: true })
      : io({ withCredentials: true });
    setSocket(connection);
    return () => {
      connection.disconnect();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!socket || !chatRoom) return;
    socket.emit("join-room", chatRoom.id);
    socket.emit("mark-as-read", chatRoom.id);
    const receive = (message: ChatRoom["messages"][number]) => {
      setChatRoom((current) =>
        current && !current.messages.some((item) => item.id === message.id)
          ? { ...current, messages: [...current.messages, message] }
          : current,
      );
    };
    const markRead = (event: { readerId: number; readAt: string }) => {
      setChatRoom((current) =>
        current
          ? {
              ...current,
              messages: current.messages.map((message) =>
                message.sender.id !== event.readerId
                  ? { ...message, readAt: event.readAt }
                  : message,
              ),
            }
          : current,
      );
    };
    socket.on("new-message", receive);
    socket.on("messages-read", markRead);
    return () => {
      socket.off("new-message", receive);
      socket.off("messages-read", markRead);
    };
  }, [socket, chatRoom?.id]);
  useEffect(() => {
    setChatImage(null);
    setChatImagePreview("");
  }, [chatRoom?.id]);

  useEffect(() => {
    if (!socket || !currentUser) return;
    const notify = (event: {
      roomId: number;
      senderName: string;
      content: string;
    }) => {
      if (chatRoom?.id === event.roomId) {
        socket.emit("mark-as-read", event.roomId);
        return;
      }
      setUnreadCount((count) => count + 1);
      setChatNotice(`${event.senderName}さん：${event.content}`);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("新しいチャットメッセージ", {
          body: `${event.senderName}さん：${event.content}`,
        });
      }
    };
    socket.on("chat-notification", notify);
    return () => {
      socket.off("chat-notification", notify);
    };
  }, [socket, currentUser?.id, chatRoom?.id]);

  useEffect(() => {
    if (currentUser) void refreshUnread();
    else setUnreadCount(0);
  }, [currentUser?.id]);
  useEffect(() => {
    if (currentUser) void loadLikes();
    else setLikedItems([]);
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser) return;
    void apiFetch("/auth/me").then(async (response) => {
      if (!response.ok) {
        logout(
          "ログインの有効期限が切れました。もう一度ログインしてください。",
        );
        return;
      }
      const user = (await response.json()).user;
      setCurrentUser(user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    });
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(event.currentTarget);
  }

  function logout(message = "ログアウトしました。") {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    void apiFetch("/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setChatRoom(null);
    setChatList(null);
    setLikedItems([]);
    setNotice(message);
  }

  async function openProfile(userId: number) {
    setProfileLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/users/${userId}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "プロフィールを取得できませんでした");
      setProfile(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "プロフィールを取得できませんでした",
      );
    } finally {
      setProfileLoading(false);
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) {
      setShowListing(false);
      setShowLogin(true);
      return;
    }
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    const course = {
      courseName: values.courseName,
      instructor: values.instructor,
      faculty: currentUser.faculty,
      department: currentUser.department,
    };
    ["courseName", "instructor"].forEach((key) => formData.delete(key));
    formData.set("course", JSON.stringify(course));

    try {
      const response = await apiFetch("/items", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "出品に失敗しました");
      setShowListing(false);
      setNotice("出品しました！商品一覧に追加されています。");
      setImagePreviews([]);
      form.reset();
      await search();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "出品に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authLoading) return;
    setAuthError("");
    setAuthLoading(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await apiFetch(`/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(authMode === "register" && { grade: Number(values.grade) }),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthError(data.error ?? "ログインできませんでした");
        return;
      }
      setCurrentUser(data.user);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      localStorage.setItem(
        SESSION_EXPIRY_KEY,
        String(Date.now() + SESSION_DURATION),
      );
      setShowLogin(false);
    } catch {
      setAuthError("サーバーに接続できませんでした。少し待ってからもう一度お試しください。");
    } finally {
      setAuthLoading(false);
    }
  }

  async function startChat(itemId: number) {
    if (!currentUser) {
      setShowLogin(true);
      return;
    }
    const response = await apiFetch("/chat-rooms", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ itemId }),
    });
    const data = await response.json();
    if (!response.ok)
      return setError(data.error ?? "チャットを開始できませんでした");
    const messages = await apiFetch(`/chat-rooms/${data.room.id}/messages`, {
      headers: authHeaders(false),
    });
    setChatRoom((await messages.json()).room);
  }

  async function openChats() {
    if (!currentUser) {
      setShowLogin(true);
      return;
    }
    if ("Notification" in window && Notification.permission === "default")
      void Notification.requestPermission();
    const response = await apiFetch("/chat-rooms", {
      headers: authHeaders(false),
    });
    const data = await response.json();
    if (!response.ok)
      return setError(data.error ?? "チャット一覧を取得できませんでした");
    setChatList(data.rooms);
    setUnreadCount(
      data.rooms.reduce(
        (sum: number, room: ChatSummary) => sum + room._count.messages,
        0,
      ),
    );
  }

  async function refreshUnread() {
    const response = await apiFetch("/chat-rooms", {
      headers: authHeaders(false),
    });
    if (!response.ok) return;
    const data = await response.json();
    setUnreadCount(
      data.rooms.reduce(
        (sum: number, room: ChatSummary) => sum + room._count.messages,
        0,
      ),
    );
  }

  async function loadLikes() {
    const response = await apiFetch("/likes", {
      headers: authHeaders(false),
    });
    if (!response.ok) return;
    setLikedItems((await response.json()).items);
  }

  async function toggleLike(item: Item) {
    if (!currentUser) {
      setShowLogin(true);
      return;
    }
    const response = await apiFetch("/likes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await response.json();
    if (!response.ok)
      return setError(data.error ?? "いいねを変更できませんでした");
    setLikedItems((current) =>
      data.liked
        ? [item, ...current.filter((liked) => liked.id !== item.id)]
        : current.filter((liked) => liked.id !== item.id),
    );
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? { ...entry, _count: { likes: data.count } }
          : entry,
      ),
    );
    setSelectedItem((current) =>
      current?.id === item.id
        ? { ...current, _count: { likes: data.count } }
        : current,
    );
  }

  async function selectChat(id: number) {
    if (!currentUser) return;
    const response = await apiFetch(`/chat-rooms/${id}/messages`, {
      headers: authHeaders(false),
    });
    const data = await response.json();
    if (response.ok) {
      const readCount =
        chatList?.find((room) => room.id === id)?._count.messages ?? 0;
      setUnreadCount((count) => Math.max(0, count - readCount));
      setChatList(null);
      setChatRoom(data.room);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatRoom || !currentUser) return;
    const form = event.currentTarget;
    const content = String(new FormData(form).get("content") ?? "").trim();
    if (!content && !chatImage) return;
    if (chatImage) {
      const data = new FormData();
      data.set("image", chatImage);
      data.set("content", content);
      const response = await apiFetch(`/chat-rooms/${chatRoom.id}/images`, {
        method: "POST",
        body: data,
      });
      if (!response.ok) {
        const result = await response.json();
        return setError(result.error ?? "画像を送信できませんでした");
      }
      form.reset();
      setChatImage(null);
      setChatImagePreview("");
      return;
    }
    socket?.emit(
      "send-message",
      { roomId: chatRoom.id, content },
      (result: { ok: boolean; error?: string }) => {
        if (result.ok) form.reset();
        else setError(result.error ?? "送信できませんでした");
      },
    );
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await apiFetch(`/users/${currentUser.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const data = await response.json();
      if (response.status === 401 && data.error?.includes("有効期限")) {
        setShowAccount(false);
        logout("安全のため、アカウント削除前にもう一度ログインしてください。");
        setShowLogin(true);
        return;
      }
      return setError(data.error ?? "アカウントを削除できませんでした");
    }
    setShowAccount(false);
    logout("アカウントと関連データを削除しました。");
  }

  async function cancelListing(item: Item) {
    if (!window.confirm(`「${item.title}」の出品を取り消しますか？`)) return;
    const response = await apiFetch(`/items/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      return setError(data.error ?? "出品を取り消せませんでした");
    }
    setItems((current) => current.filter((listed) => listed.id !== item.id));
    setLikedItems((current) => current.filter((liked) => liked.id !== item.id));
    setSelectedItem(null);
    setNotice("出品を取り消しました。");
  }

  const selectedImages = selectedItem
    ? selectedItem.images.length
      ? selectedItem.images.map((image) => image.url)
      : selectedItem.imageUrl
        ? [selectedItem.imageUrl]
        : []
    : [];

  return (
    <main>
      <header>
        <nav>
          <span className="eyebrow">KEIO STUDENTS ONLY</span>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? "閉じる ×" : "メニュー ☰"}
          </button>
          <div className="nav-actions">
            {currentUser ? (
              <>
                <button
                  type="button"
                  className="user-button"
                  onClick={() => {
                    setAccountTab("profile");
                    setShowAccount(true);
                  }}
                >
                  <span className="nav-user-avatar" aria-hidden="true">
                    {currentUser.name.slice(0, 1)}
                  </span>
                  <span className="nav-user-copy">
                    <strong>{currentUser.name}</strong>
                    <small>マイページ</small>
                  </span>
                  <span className="nav-user-chevron" aria-hidden="true">⌄</span>
                </button>
                <button type="button" onClick={() => void openChats()}>
                  チャット
                </button>
                <button
                  type="button"
                  className="logout-button"
                  onClick={() => logout()}
                >
                  ログアウト
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setShowLogin(true)}>
                ログイン
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                currentUser ? setShowListing(true) : setShowLogin(true)
              }
            >
              ＋ 出品する
            </button>
          </div>
          {mobileMenuOpen && (
            <div id="mobile-navigation" className="mobile-navigation">
              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountTab("profile");
                      setShowAccount(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    マイアカウント
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void openChats();
                    }}
                  >
                    チャット{unreadCount > 0 ? `（${unreadCount}件）` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowListing(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    ＋ 出品する
                  </button>
                  <button
                    type="button"
                    className="mobile-logout"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                  >
                    ログアウト
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogin(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    ログイン
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogin(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    ＋ 出品する
                  </button>
                </>
              )}
            </div>
          )}
        </nav>
        <h1>
          次の人へ、
          <br />
          知識をつなぐ。
        </h1>
        <p>慶應生のための教科書マーケット</p>
      </header>

      <form className="search-form" onSubmit={submit}>
        <input name="courseName" placeholder="授業名・教科書名" />
        <select
          name="faculty"
          value={searchFaculty}
          onChange={(event) =>
            setSearchFaculty(event.target.value as Faculty | "")
          }
        >
          <option value="">すべての学部</option>
          {faculties.map((faculty) => (
            <option key={faculty}>{faculty}</option>
          ))}
        </select>
        <select
          name="department"
          defaultValue=""
          key={searchFaculty}
          disabled={!searchFaculty}
        >
          <option value="">
            {searchFaculty ? "すべての学科" : "先に学部を選択"}
          </option>
          {searchFaculty &&
            departmentsByFaculty[searchFaculty].map((department) => (
              <option key={department}>{department}</option>
            ))}
        </select>
        <select name="grade" defaultValue="">
          <option value="">すべての学年</option>
          {[1, 2, 3, 4, 5, 6].map((grade) => (
            <option key={grade} value={grade}>
              {grade}年
            </option>
          ))}
        </select>
        <select name="sort" defaultValue="newest">
          <option value="newest">新着順</option>
          <option value="gpa_desc">出品者GPAが高い順</option>
          <option value="price_asc">価格が安い順</option>
          <option value="price_desc">価格が高い順</option>
        </select>
        <button>検索する</button>
      </form>

      {showListing && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowListing(false)}
        >
          <div
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">NEW LISTING</span>
                <h2>教材を出品する</h2>
              </div>
              <button
                className="close"
                type="button"
                onClick={() => setShowListing(false)}
              >
                ×
              </button>
            </div>
            <form className="listing-form" onSubmit={createItem}>
              <fieldset>
                <legend>商品情報</legend>
                <label className="required-field">
                  商品名
                  <input
                    name="title"
                    placeholder="例：入門ミクロ経済学"
                    required
                  />
                </label>
                <div className="form-row">
                  <label className="required-field">
                    種類
                    <select name="type" required>
                      <option value="TEXTBOOK">教科書</option>
                      <option value="NOTES">授業ノート</option>
                      <option value="OTHER">その他</option>
                    </select>
                  </label>
                  <label className="required-field">
                    状態
                    <select name="condition" required>
                      <option value="LIKE_NEW">ほぼ新品</option>
                      <option value="GOOD">良好</option>
                      <option value="FAIR">使用感あり</option>
                      <option value="POOR">傷・書き込みあり</option>
                    </select>
                  </label>
                  <label className="required-field">
                    価格
                    <input
                      name="price"
                      type="number"
                      min="0"
                      placeholder="1200"
                      required
                    />
                  </label>
                </div>
                <label className="optional-field">
                  説明
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="書き込みや傷の状態など"
                  />
                </label>
                <label className="image-picker required-field">
                  商品写真（1〜10枚）
                  <input
                    name="images"
                    type="file"
                    accept="image/*"
                    required
                    multiple
                    onChange={(event) => {
                      const files = [...(event.target.files ?? [])];
                      if (files.length > 10) {
                        event.target.value = "";
                        setImagePreviews([]);
                        setError("商品写真は10枚まで選択できます");
                        return;
                      }
                      setError("");
                      setImagePreviews(
                        files.map((file) => URL.createObjectURL(file)),
                      );
                    }}
                  />
                  <span>📷 写真を撮る・ライブラリから選ぶ（最大10枚）</span>
                </label>
                {imagePreviews.length > 0 && (
                  <>
                    <small>{imagePreviews.length}枚選択中</small>
                    <div className="image-previews">
                      {imagePreviews.map((url, index) => (
                        <img
                          className="image-preview"
                          src={assetUrl(url)}
                          alt={`選択した商品写真 ${index + 1}`}
                          key={url}
                        />
                      ))}
                    </div>
                  </>
                )}
              </fieldset>
              <fieldset>
                <legend>授業情報</legend>
                <div className="form-row">
                  <label className="required-field">
                    授業名
                    <input name="courseName" required />
                  </label>
                  <label className="optional-field">
                    担当教員
                    <input name="instructor" />
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>出品者情報</legend>
                {currentUser && (
                  <div className="seller-confirm">
                    <div className="avatar">{currentUser.name.slice(0, 1)}</div>
                    <div>
                      <strong>{currentUser.name}</strong>
                      <p>
                        {currentUser.faculty}・{currentUser.department}　
                        {currentUser.grade}年
                      </p>
                      <small>ログイン中のアカウントで出品します</small>
                    </div>
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend>受け渡し希望</legend>
                <p className="handoff-guide">
                  ここでは大まかな希望を入力します。購入希望が届いた後、チャットで相談して最終的な場所・日時を決めます。
                </p>
                <div className="form-row">
                  <label className="optional-field">
                    希望場所
                    <input
                      name="handoffPlace"
                      placeholder="例：日吉キャンパス付近"
                    />
                  </label>
                  <label className="optional-field">
                    希望時間帯
                    <input name="handoffTime" placeholder="例：平日の昼休み" />
                  </label>
                </div>
              </fieldset>
              <button className="submit-listing" disabled={saving}>
                {saving ? "出品中..." : "この内容で出品する"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showLogin && (
        <div className="modal-backdrop" onMouseDown={() => setShowLogin(false)}>
          <div
            className="modal login-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">ACCOUNT</span>
                <h2>{authMode === "login" ? "ログイン" : "新規登録"}</h2>
              </div>
              <button
                className="close"
                type="button"
                onClick={() => setShowLogin(false)}
              >
                ×
              </button>
            </div>
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                ログイン
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                新規登録
              </button>
            </div>
            <form className="listing-form" onSubmit={login} aria-busy={authLoading}>
              <label className="required-field">
                慶應メール
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label className="required-field">
                パスワード
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="8文字以上"
                />
              </label>
              {authMode === "register" && (
                <>
                  <label className="required-field">
                    名前・ニックネーム
                    <input name="name" required />
                  </label>
                  <div className="form-row">
                    <label className="required-field">
                      学部
                      <select
                        name="faculty"
                        value={loginFaculty}
                        onChange={(event) =>
                          setLoginFaculty(event.target.value as Faculty | "")
                        }
                        required
                      >
                        <option value="">選択してください</option>
                        {faculties.map((faculty) => (
                          <option key={faculty}>{faculty}</option>
                        ))}
                      </select>
                    </label>
                    <label className="required-field">
                      学科
                      <select
                        name="department"
                        disabled={!loginFaculty}
                        required
                        defaultValue=""
                        key={loginFaculty}
                      >
                        <option value="">
                          {loginFaculty ? "選択してください" : "先に学部を選択"}
                        </option>
                        {loginFaculty &&
                          departmentsByFaculty[loginFaculty].map(
                            (department) => (
                              <option key={department}>{department}</option>
                            ),
                          )}
                      </select>
                    </label>
                    <label className="required-field">
                      学年
                      <input
                        name="grade"
                        type="number"
                        min="1"
                        max="6"
                        required
                      />
                    </label>
                  </div>
                </>
              )}
              <button className="submit-listing" disabled={authLoading}>
                {authLoading && <span className="button-spinner" aria-hidden="true" />}
                {authLoading
                  ? authMode === "login"
                    ? "ログイン中…"
                    : "登録中…"
                  : authMode === "login"
                    ? "ログインする"
                    : "登録してはじめる"}
              </button>
              {authLoading && (
                <p className="auth-loading-message" role="status">
                  サーバーへ接続しています。数秒かかることがあります。
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {selectedItem && (
        <div className="item-detail-page">
          <div className="item-detail-header">
            <button type="button" onClick={() => setSelectedItem(null)}>
              ← 商品一覧へ戻る
            </button>
            <span>商品詳細</span>
          </div>
          <div className="item-detail-content">
            <div className="detail-gallery">
              <div className="detail-main-image">
                {selectedImages[detailImage] ? (
                  <img
                    src={assetUrl(selectedImages[detailImage])}
                    alt={selectedItem.title}
                  />
                ) : (
                  <span>NO IMAGE</span>
                )}
              </div>
              {selectedImages.length > 1 && (
                <div className="detail-thumbnails">
                  {selectedImages.map((url, index) => (
                    <button
                      type="button"
                      className={detailImage === index ? "active" : ""}
                      onClick={() => setDetailImage(index)}
                      key={url}
                    >
                      <img
                        src={assetUrl(url)}
                        alt={`${selectedItem.title} ${index + 1}`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-info">
              <small>{selectedItem.course.courseName}</small>
              <h1>{selectedItem.title}</h1>
              <strong className="detail-price">
                ¥{selectedItem.price.toLocaleString()}
              </strong>
              <div className="detail-tags">
                <span>
                  {selectedItem.type === "TEXTBOOK"
                    ? "教科書"
                    : selectedItem.type === "NOTES"
                      ? "授業ノート"
                      : "その他"}
                </span>
                <span>
                  {selectedItem.condition === "LIKE_NEW"
                    ? "ほぼ新品"
                    : selectedItem.condition === "GOOD"
                      ? "良好"
                      : selectedItem.condition === "FAIR"
                        ? "使用感あり"
                        : "傷・書き込みあり"}
                </span>
              </div>
              <section className="detail-section">
                <h2>商品の説明</h2>
                <p>{selectedItem.description || "説明はありません。"}</p>
              </section>
              <section className="detail-section">
                <h2>出品者</h2>
                <button
                  className="detail-seller"
                  type="button"
                  onClick={() => void openProfile(selectedItem.seller.id)}
                >
                  <span className="avatar">
                    {selectedItem.seller.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{selectedItem.seller.name}</strong>
                    <small>
                      {selectedItem.seller.faculty}・{selectedItem.seller.grade}
                      年
                    </small>
                  </span>
                </button>
              </section>
              {(selectedItem.handoffPlace || selectedItem.handoffTime) && (
                <section className="detail-section">
                  <h2>受け渡し希望</h2>
                  <p>
                    {selectedItem.handoffPlace || "場所は相談"}
                    {selectedItem.handoffTime &&
                      `・${selectedItem.handoffTime}`}
                  </p>
                  <small>
                    具体的な場所・日時はチャットで相談して決定します。
                  </small>
                </section>
              )}
              <div className="detail-actions">
                {currentUser?.id === selectedItem.seller.id ? (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => void cancelListing(selectedItem)}
                  >
                    この出品を取り消す
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={
                        likedItems.some((liked) => liked.id === selectedItem.id)
                          ? "detail-like liked"
                          : "detail-like"
                      }
                      onClick={() => void toggleLike(selectedItem)}
                    >
                      {likedItems.some((liked) => liked.id === selectedItem.id)
                        ? "♥ いいね済み"
                        : "♡ いいね"}
                      （{selectedItem._count.likes}）
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItem(null);
                        void startChat(selectedItem.id);
                      }}
                    >
                      購入相談・チャット
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {chatList && currentUser && (
        <div className="modal-backdrop" onMouseDown={() => setChatList(null)}>
          <div
            className="modal chat-list-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">MESSAGES</span>
                <h2>チャット一覧</h2>
              </div>
              <button
                className="close"
                type="button"
                onClick={() => setChatList(null)}
              >
                ×
              </button>
            </div>
            {chatList.length === 0 ? (
              <p className="message">チャットはまだありません。</p>
            ) : (
              <div className="chat-list">
                {chatList.map((room) => {
                  const partner =
                    room.buyer.id === currentUser.id ? room.seller : room.buyer;
                  return (
                    <button
                      type="button"
                      key={room.id}
                      onClick={() => void selectChat(room.id)}
                    >
                      {room.item.imageUrl ? (
                        <img src={assetUrl(room.item.imageUrl)} alt="" />
                      ) : (
                        <div className="mini-book">BOOK</div>
                      )}
                      <span>
                        <strong>{room.item.title}</strong>
                        <small>{partner.name}さん</small>
                        <em>
                          {room.messages[0]?.content ??
                            "メッセージはまだありません"}
                        </em>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {chatRoom && currentUser && (
        <div className="modal-backdrop" onMouseDown={() => setChatRoom(null)}>
          <div
            className="modal chat-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">CHAT</span>
                <h2>{chatRoom.item.title}</h2>
                <p>
                  {chatRoom.buyer.name} ↔ {chatRoom.seller.name}
                </p>
              </div>
              <button
                className="close"
                type="button"
                onClick={() => setChatRoom(null)}
              >
                ×
              </button>
            </div>
            <div className="chat-guide">
              受け渡し場所・日時などを相談しましょう。住所や電話番号など必要以上の個人情報は送らないでください。
            </div>
            <div className="messages">
              {chatRoom.messages.length === 0 && (
                <p className="message">最初のメッセージを送ってみましょう。</p>
              )}
              {chatRoom.messages.map((message) => (
                <div
                  className={
                    message.sender.id === currentUser.id
                      ? "bubble mine"
                      : "bubble"
                  }
                  key={message.id}
                >
                  <small>{message.sender.name}</small>
                  {message.imageUrl && (
                    <a
                      href={assetUrl(message.imageUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="chat-image"
                        src={assetUrl(message.imageUrl)}
                        alt="チャットで送信された画像"
                      />
                    </a>
                  )}
                  {message.content && <p>{message.content}</p>}
                  <time>
                    {new Date(message.createdAt).toLocaleString("ja-JP")}
                  </time>
                </div>
              ))}
            </div>
            <form className="message-form" onSubmit={sendMessage}>
              {chatImagePreview && (
                <div className="chat-image-preview">
                  <img src={chatImagePreview} alt="送信予定の画像" />
                  <button
                    type="button"
                    onClick={() => {
                      setChatImage(null);
                      setChatImagePreview("");
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <label className="chat-attach" title="ライブラリから選ぶ">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setChatImage(file);
                    setChatImagePreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
                <span>🖼️</span>
                <small>写真</small>
              </label>
              <label className="chat-attach" title="カメラで撮る">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setChatImage(file);
                    setChatImagePreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
                <span>📷</span>
                <small>撮影</small>
              </label>
              <textarea
                name="content"
                rows={2}
                maxLength={1000}
                placeholder="例：日吉キャンパスで受け取れますか？"
              />
              <button>送信</button>
            </form>
          </div>
        </div>
      )}

      {showAccount && currentUser && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowAccount(false)}
        >
          <div
            className="modal account-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">MY ACCOUNT</span>
                <h2>マイアカウント</h2>
              </div>
              <button
                className="close"
                type="button"
                onClick={() => setShowAccount(false)}
              >
                ×
              </button>
            </div>
            <div className="account-layout">
              <aside className="account-menu">
                <button
                  className={accountTab === "profile" ? "active" : ""}
                  onClick={() => setAccountTab("profile")}
                >
                  プロフィール
                </button>
                <button
                  className={accountTab === "likes" ? "active" : ""}
                  onClick={() => setAccountTab("likes")}
                >
                  いいねした商品
                </button>
                <button
                  className={accountTab === "settings" ? "active" : ""}
                  onClick={() => setAccountTab("settings")}
                >
                  設定
                </button>
                <button
                  className={
                    accountTab === "delete" ? "active danger" : "danger"
                  }
                  onClick={() => setAccountTab("delete")}
                >
                  アカウント削除
                </button>
              </aside>
              <div className="account-content">
                {accountTab === "profile" && (
                  <>
                    <div className="account-profile">
                      <div className="avatar">
                        {currentUser.name.slice(0, 1)}
                      </div>
                      <div>
                        <h3>{currentUser.name}</h3>
                        <p>
                          {currentUser.faculty}・{currentUser.department}
                        </p>
                        <p>{currentUser.grade}年</p>
                      </div>
                    </div>
                    <div className="account-info">
                      <span>公開プロフィール</span>
                      <p>
                        名前、所属、学年は商品ページの出品者プロフィールに表示されます。慶應メールとパスワードは公開されません。
                      </p>
                    </div>
                  </>
                )}
                {accountTab === "likes" && (
                  <>
                    <h3>いいねした商品</h3>
                    {likedItems.length === 0 ? (
                      <p className="message">
                        いいねした商品はまだありません。
                      </p>
                    ) : (
                      <div className="liked-items">
                        {likedItems.map((item) => (
                          <div className="liked-item" key={item.id}>
                            <img
                              src={assetUrl(
                                item.images[0]?.url || item.imageUrl,
                              )}
                              alt={item.title}
                            />
                            <div>
                              <small>{item.course.courseName}</small>
                              <strong>{item.title}</strong>
                              <span>¥{item.price.toLocaleString()}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void toggleLike(item)}
                              title="いいねを解除"
                            >
                              ♥
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {accountTab === "settings" && (
                  <>
                    <h3>ログイン設定</h3>
                    <div className="setting-row">
                      <div>
                        <strong>自動ログアウト</strong>
                        <p>
                          ログインは最終操作から7日間有効です。
                        </p>
                      </div>
                      <span>7日間</span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>現在の端末</strong>
                        <p>このブラウザにログイン情報が保存されています。</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccount(false);
                          logout();
                        }}
                      >
                        ログアウト
                      </button>
                    </div>
                  </>
                )}
                {accountTab === "delete" && (
                  <div className="danger-zone">
                    <h3>アカウントを削除</h3>
                    <p>
                      プロフィール、出品、いいね、需要登録、チャット、取引関連データが削除されます。この操作は取り消せません。
                    </p>
                    <form className="listing-form" onSubmit={deleteAccount}>
                      <label className="required-field">
                        現在のパスワード
                        <input
                          name="password"
                          type="password"
                          required
                          autoComplete="current-password"
                        />
                      </label>
                      <label className="required-field">
                        確認のため「削除」と入力
                        <input name="confirmation" required pattern="削除" />
                      </label>
                      <button className="delete-button">完全に削除する</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showLogin && authError && (
        <div className="auth-error-toast" role="alert">
          {authError}
        </div>
      )}
      {currentUser && unreadCount > 0 && (
        <button
          className="unread-fab"
          type="button"
          onClick={() => {
            setChatNotice("");
            void openChats();
          }}
        >
          <span>{unreadCount}</span> 新着チャット
          {chatNotice && <small>{chatNotice}</small>}
        </button>
      )}

      {(profile || profileLoading) && (
        <div className="modal-backdrop" onMouseDown={() => setProfile(null)}>
          <div
            className="modal profile-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {profileLoading && (
              <p className="message">プロフィールを読み込み中...</p>
            )}
            {profile && !profileLoading && (
              <>
                <div className="modal-heading">
                  <div className="profile-heading">
                    <div className="avatar">
                      {profile.user.name.slice(0, 1)}
                    </div>
                    <div>
                      <span className="eyebrow">SELLER PROFILE</span>
                      <h2>{profile.user.name}</h2>
                      <p>
                        {profile.user.faculty}
                        {profile.user.department &&
                          `・${profile.user.department}`}
                        　{profile.user.grade}年
                      </p>
                    </div>
                  </div>
                  <button
                    className="close"
                    type="button"
                    onClick={() => setProfile(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="profile-stats">
                  <div>
                    <strong>{profile.stats.listings}</strong>
                    <span>出品数</span>
                  </div>
                  <div>
                    <strong>{profile.stats.completedTransactions}</strong>
                    <span>取引完了</span>
                  </div>
                  <div>
                    <strong>
                      {profile.stats.averageRating === null
                        ? "—"
                        : `★ ${profile.stats.averageRating.toFixed(1)}`}
                    </strong>
                    <span>評価（{profile.stats.reviewCount}件）</span>
                  </div>
                  <div>
                    <strong>{profile.user.gpa ?? "任意"}</strong>
                    <span>GPA</span>
                  </div>
                </div>
                <div className="privacy-note">
                  慶應メールアドレスは本人確認用のため、ほかのユーザーには公開されません。
                </div>
                <h3 className="profile-subtitle">最近の出品</h3>
                {profile.user.items.length === 0 ? (
                  <p className="message">出品はまだありません。</p>
                ) : (
                  <div className="profile-items">
                    {profile.user.items.map((item) => (
                      <div className="profile-item" key={item.id}>
                        {item.images[0]?.url || item.imageUrl ? (
                          <img
                            src={assetUrl(item.images[0]?.url || item.imageUrl)}
                            alt=""
                          />
                        ) : (
                          <div className="mini-book">BOOK</div>
                        )}
                        <div>
                          <small>{item.course.courseName}</small>
                          <strong>{item.title}</strong>
                          <span>¥{item.price.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <section>
        {notice && <p className="notice">{notice}</p>}
        <div className="section-title">
          <h2>出品中の教科書</h2>
          <span>{items.length}冊</span>
        </div>
        {loading && <p className="message">読み込み中...</p>}
        {error && <p className="message error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="message">条件に合う教科書はありません。</p>
        )}
        <div className="grid">
          {items.map((item) => (
            <article
              key={item.id}
              className="item-card"
              onClick={() => {
                setDetailImage(0);
                setSelectedItem(item);
              }}
            >
              <div className="book">
                {item.images[0]?.url || item.imageUrl ? (
                  <img
                    src={assetUrl(item.images[0]?.url || item.imageUrl)}
                    alt={item.title}
                  />
                ) : (
                  <span>{item.course.courseName}</span>
                )}
              </div>
              <div className="card-body">
                <small>
                  {item.seller.faculty}・{item.seller.grade}年
                </small>
                <h3>{item.title}</h3>
                <div className="meta">
                  <strong>¥{item.price.toLocaleString()}</strong>
                  <button
                    className={
                      likedItems.some((liked) => liked.id === item.id)
                        ? "like-button liked"
                        : "like-button"
                    }
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleLike(item);
                    }}
                    aria-label={
                      likedItems.some((liked) => liked.id === item.id)
                        ? "いいねを解除"
                        : "いいねする"
                    }
                  >
                    {likedItems.some((liked) => liked.id === item.id)
                      ? "♥"
                      : "♡"}{" "}
                    {item._count.likes}
                  </button>
                </div>
                <p>
                  出品者{" "}
                  <button
                    className="seller-link"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openProfile(item.seller.id);
                    }}
                  >
                    {item.seller.name}
                  </button>
                  {item.seller.gpa !== null && <>　GPA {item.seller.gpa}</>}
                </p>
                {item.handoffPlace && (
                  <p>受け渡し希望：{item.handoffPlace}（詳細はチャット）</p>
                )}
                <button
                  className="chat-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void startChat(item.id);
                  }}
                >
                  購入相談・チャット
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
