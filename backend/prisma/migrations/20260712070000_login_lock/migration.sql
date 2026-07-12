CREATE TABLE "LoginAttempt" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "LoginAttempt_email_key" ON "LoginAttempt"("email");
