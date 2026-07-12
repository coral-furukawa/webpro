DROP TABLE IF EXISTS "User" CASCADE;
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL, "faculty" TEXT NOT NULL,
  "grade" INTEGER NOT NULL CHECK ("grade" BETWEEN 1 AND 6),
  "gpa" DECIMAL(3,2) NOT NULL CHECK ("gpa" BETWEEN 0 AND 4)
);
CREATE TABLE "Course" (
  "id" SERIAL PRIMARY KEY, "courseName" TEXT NOT NULL, "faculty" TEXT NOT NULL
);
CREATE TABLE "Item" (
  "id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL, "price" INTEGER NOT NULL CHECK ("price" >= 0),
  "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE', "sellerId" INTEGER NOT NULL,
  "courseId" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Like" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "itemId" INTEGER NOT NULL
);
CREATE TABLE "Demand" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "courseId" INTEGER NOT NULL
);

CREATE INDEX "User_faculty_grade_gpa_idx" ON "User"("faculty", "grade", "gpa");
CREATE INDEX "Course_courseName_idx" ON "Course"("courseName");
CREATE INDEX "Course_faculty_idx" ON "Course"("faculty");
CREATE INDEX "Item_sellerId_idx" ON "Item"("sellerId");
CREATE INDEX "Item_courseId_idx" ON "Item"("courseId");
CREATE INDEX "Item_status_createdAt_idx" ON "Item"("status", "createdAt");
CREATE UNIQUE INDEX "Like_userId_itemId_key" ON "Like"("userId", "itemId");
CREATE INDEX "Like_itemId_idx" ON "Like"("itemId");
CREATE UNIQUE INDEX "Demand_userId_courseId_key" ON "Demand"("userId", "courseId");
CREATE INDEX "Demand_courseId_idx" ON "Demand"("courseId");

ALTER TABLE "Item" ADD CONSTRAINT "Item_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Like" ADD CONSTRAINT "Like_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
