-- CreateTable
CREATE TABLE "card_statement" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentMethodId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "statementBalanceMinor" INTEGER NOT NULL,
    "minimumDueMinor" INTEGER,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_payment" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "statementId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statement_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_statement_userId_dueDate_idx" ON "card_statement"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "card_statement_paymentMethodId_periodEnd_idx" ON "card_statement"("paymentMethodId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "card_statement_paymentMethodId_periodStart_periodEnd_key" ON "card_statement"("paymentMethodId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "statement_payment_userId_paidOn_idx" ON "statement_payment"("userId", "paidOn");

-- CreateIndex
CREATE INDEX "statement_payment_statementId_idx" ON "statement_payment"("statementId");

-- AddForeignKey
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_method"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_payment" ADD CONSTRAINT "statement_payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_payment" ADD CONSTRAINT "statement_payment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "card_statement"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Defense in depth: the service layer is the primary guard (see docs/database.md §4).
ALTER TABLE "card_statement"
  ADD CONSTRAINT "card_statement_balance_nonneg" CHECK ("statementBalanceMinor" >= 0),
  ADD CONSTRAINT "card_statement_minimum_valid" CHECK ("minimumDueMinor" IS NULL OR ("minimumDueMinor" >= 0 AND "minimumDueMinor" <= "statementBalanceMinor")),
  ADD CONSTRAINT "card_statement_period_order" CHECK ("periodEnd" >= "periodStart"),
  ADD CONSTRAINT "card_statement_due_after_period" CHECK ("dueDate" >= "periodEnd"),
  ADD CONSTRAINT "card_statement_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "statement_payment"
  ADD CONSTRAINT "statement_payment_amount_positive" CHECK ("amountMinor" > 0);
