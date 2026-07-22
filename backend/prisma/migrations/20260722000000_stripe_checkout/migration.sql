ALTER TABLE "Transaction" ADD COLUMN "stripeCheckoutSessionId" TEXT;

CREATE UNIQUE INDEX "Transaction_stripeCheckoutSessionId_key"
ON "Transaction"("stripeCheckoutSessionId");
