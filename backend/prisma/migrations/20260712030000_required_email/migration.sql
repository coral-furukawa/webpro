-- 開発中にメールなしで作成されたユーザーへ、衝突しない仮値を設定してから必須化する。
UPDATE "User" SET "email" = 'pending-' || "id" || '@invalid.local' WHERE "email" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
