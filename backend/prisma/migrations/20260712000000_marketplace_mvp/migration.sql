CREATE TYPE "ItemType" AS ENUM ('TEXTBOOK', 'NOTES', 'OTHER');
CREATE TYPE "ItemCondition" AS ENUM ('LIKE_NEW', 'GOOD', 'FAIR', 'POOR');
CREATE TYPE "TransactionStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "User" ADD COLUMN "department" TEXT;
ALTER TABLE "User" ADD COLUMN "email" TEXT;
UPDATE "User" SET "email" = 'user-' || "id" || '@keio.jp';
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Course" ADD COLUMN "department" TEXT;
ALTER TABLE "Course" ADD COLUMN "instructor" TEXT;
ALTER TABLE "Course" ADD COLUMN "weekday" INTEGER;
ALTER TABLE "Course" ADD COLUMN "period" INTEGER;

ALTER TABLE "Item" ADD COLUMN "type" "ItemType" NOT NULL DEFAULT 'TEXTBOOK';
ALTER TABLE "Item" ADD COLUMN "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD';
ALTER TABLE "Item" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Item" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Item" ADD COLUMN "handoffPlace" TEXT;
ALTER TABLE "Item" ADD COLUMN "handoffTime" TEXT;

CREATE TABLE "Transaction" (
  "id" SERIAL PRIMARY KEY, "itemId" INTEGER NOT NULL, "buyerId" INTEGER NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'REQUESTED', "handoffPlace" TEXT,
  "handoffTime" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Transaction_itemId_key" ON "Transaction"("itemId");
CREATE INDEX "Transaction_buyerId_status_idx" ON "Transaction"("buyerId", "status");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Review" (
  "id" SERIAL PRIMARY KEY, "transactionId" INTEGER NOT NULL, "reviewerId" INTEGER NOT NULL,
  "revieweeId" INTEGER NOT NULL, "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Review_transactionId_reviewerId_key" ON "Review"("transactionId", "reviewerId");
CREATE INDEX "Review_revieweeId_idx" ON "Review"("revieweeId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
