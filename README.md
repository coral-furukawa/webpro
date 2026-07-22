# 慶應生向け教科書売買アプリ

React、Express、Prisma、PostgreSQLによる三層構成のWebアプリです。

授業提出・チーム共有用の設計内容は [設計メモ](docs/DESIGN.md) にまとめています。

```text
webpro2026/
├── backend/
│   ├── package.json
│   ├── prisma.config.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/server.ts
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       └── main.tsx
└── README.md
```

## 1. 環境変数

既存のルート `.env` をそのまま利用できます。新規作成する場合は、ルートまたは `backend/` に次の内容で作成してください。

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/textbook_marketplace"
PORT=8888
JWT_SECRET="十分に長いランダムな文字列"
FRONTEND_URL="http://localhost:5173"
ALLOWED_EMAIL_DOMAINS="keio.jp"
CLOUDINARY_CLOUD_NAME="CloudinaryのCloud name"
CLOUDINARY_API_KEY="CloudinaryのAPI key"
CLOUDINARY_API_SECRET="CloudinaryのAPI secret"
STRIPE_SECRET_KEY="sk_test_から始まるStripeテスト用シークレットキー"
STRIPE_WEBHOOK_SECRET="Stripe Webhookの署名シークレット"
```

## 2. バックエンド

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Prismaの開発DBを使う場合は、マイグレーションより先に別ターミナルで `npm run db:dev` を実行します。

## 3. フロントエンド

```bash
cd frontend
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。Viteのプロキシが `/items` を `http://localhost:8888` のExpress APIへ転送します。

本番環境ではフロントエンドに次の環境変数を設定します。末尾の `/` は不要です。

```env
VITE_API_URL="https://your-backend.onrender.com"
```

HTTP API、Socket.IO、アップロード画像はすべてこのURLを利用します。未設定の場合はローカル開発用のViteプロキシを利用します。

## 画像保存

Cloudinaryの3つの環境変数がすべて設定されている場合、商品画像とチャット画像はCloudinaryへ保存されます。未設定のローカル環境では `backend/uploads/` へ保存されます。Renderでは一時ファイルが再起動時に消えるため、Cloudinary環境変数を必ず設定してください。

## 認証とセキュリティ

- JWTはJavaScriptから読めないHTTP-only Cookieへ保存
- Cookieは本番で `Secure` / `SameSite=None`
- ログイン・登録にレート制限と5回失敗時の15分間ロックを適用
- `ALLOWED_EMAIL_DOMAINS` で登録可能な大学メールドメインを制限
- 出品、いいね、需要、チャット、アカウント削除はCookie認証から本人を判定
- Helmetでセキュリティ関連HTTPヘッダーを設定

メールアドレスへ確認コードを実際に送信するには、Resend等のメール配信サービスのAPIキーと送信元ドメイン設定が別途必要です。

## テストポイント

授業提出用のテスト機能として、1ポイントを1円相当として商品を購入できます。ポイントの換金・出金はできません。商品購入時は、残高の減算、出品者への売上ポイント加算、取引記録、商品の売却済みへの変更を同じDBトランザクションで行います。

チャージにはStripeのテストモードだけを使用できます。`STRIPE_SECRET_KEY` が `sk_test_` で始まらない場合、チャージAPIは無効になります。Stripe Checkoutではテストカードと日本円銀行振込を選択できます。銀行振込を表示するには、Stripe Dashboardでも銀行振込を有効にしてください。

Webhookの送信先を `https://your-backend.onrender.com/payments/webhook` に設定し、`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired` を購読してください。

ローカルではStripe CLIでWebhookを転送できます。

```bash
stripe listen --forward-to localhost:8888/payments/webhook
```

チャージ履歴はStripe Checkout Session IDを一意キーとして記録するため、同じWebhookが複数回来ても残高は一度だけ増加します。本機能を実เงินจริงで本番運用することは想定していません。

## 商品検索API

```http
GET /items?faculty=経済学部&grade=2&courseName=統計&sort=gpa_desc
```

| パラメータ | 内容 |
| --- | --- |
| `faculty` | 出品者の学部 |
| `grade` | 出品者の学年（1〜6） |
| `courseName` | 授業名の部分一致検索 |
| `sort` | `newest`, `gpa_desc`, `gpa_asc`, `price_asc`, `price_desc` |

出品者の学部・学年・GPAはItemへ重複保存せず、`Item.seller` リレーションを通して検索・取得します。

## 提出・デプロイ情報

- GitHub: https://github.com/coral-furukawa/webpro
- Render（バックエンド）: https://webpro-a827.onrender.com
- Render（フロントエンド）: https://frontend-t4x8.onrender.com
- 制作レポート: [docs/REPORT.md](docs/REPORT.md)

`.env` と秘密鍵はGitHubへコミットしません。
