CREATE TYPE "WalletEntryType" AS ENUM ('TOP_UP', 'PURCHASE', 'SALE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "WalletTopUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

CREATE TABLE "Wallet" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "stripeCustomerId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "WalletEntry" (
  "id" SERIAL PRIMARY KEY,
  "walletId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" "WalletEntryType" NOT NULL,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WalletTopUp" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "WalletTopUpStatus" NOT NULL DEFAULT 'PENDING',
  "stripeCheckoutSessionId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE UNIQUE INDEX "Wallet_stripeCustomerId_key" ON "Wallet"("stripeCustomerId");
CREATE UNIQUE INDEX "WalletEntry_reference_key" ON "WalletEntry"("reference");
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");
CREATE UNIQUE INDEX "WalletTopUp_stripeCheckoutSessionId_key" ON "WalletTopUp"("stripeCheckoutSessionId");
CREATE INDEX "WalletTopUp_userId_createdAt_idx" ON "WalletTopUp"("userId", "createdAt");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
