CREATE TABLE "ItemImage" (
  "id" SERIAL PRIMARY KEY,
  "itemId" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "ItemImage_itemId_position_idx" ON "ItemImage"("itemId", "position");
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 既存商品の画像も複数画像テーブルへ移す。
INSERT INTO "ItemImage" ("itemId", "url", "position")
SELECT "id", "imageUrl", 0 FROM "Item" WHERE "imageUrl" IS NOT NULL;
