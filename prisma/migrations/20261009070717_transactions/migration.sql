-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EXPENSE', 'REFUND');

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "occurredOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "categoryId" UUID,
    "paymentMethodId" UUID,
    "subscriptionId" UUID,
    "refundOfId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_userId_name_key" ON "category"("userId", "name");

-- CreateIndex
CREATE INDEX "transaction_userId_occurredOn_idx" ON "transaction"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "transaction_userId_paymentMethodId_occurredOn_idx" ON "transaction"("userId", "paymentMethodId", "occurredOn");

-- CreateIndex
CREATE INDEX "transaction_userId_categoryId_occurredOn_idx" ON "transaction"("userId", "categoryId", "occurredOn");

-- CreateIndex
CREATE INDEX "transaction_refundOfId_idx" ON "transaction"("refundOfId");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_method"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "transaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Defense in depth: the service layer is the primary guard (see docs/database.md §4).
ALTER TABLE "category"
  ADD CONSTRAINT "category_name_not_blank" CHECK (length(btrim("name")) > 0);

ALTER TABLE "transaction"
  ADD CONSTRAINT "transaction_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "transaction_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "transaction_description_not_blank" CHECK (length(btrim("description")) > 0),
  -- A refund always references an expense, and only refunds do.
  ADD CONSTRAINT "transaction_refund_has_original" CHECK (("type" = 'REFUND') = ("refundOfId" IS NOT NULL)),
  ADD CONSTRAINT "transaction_not_self_refund" CHECK ("refundOfId" IS NULL OR "refundOfId" <> "id");
