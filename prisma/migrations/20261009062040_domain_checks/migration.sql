-- Defense in depth: service-layer validation is the primary guard (see docs/database.md §4).
ALTER TABLE "payment_method"
  ADD CONSTRAINT "payment_method_last4_digits" CHECK ("last4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "payment_method_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payment_method_limit_positive" CHECK ("creditLimitMinor" IS NULL OR "creditLimitMinor" > 0),
  ADD CONSTRAINT "payment_method_statement_day" CHECK ("statementDay" IS NULL OR "statementDay" BETWEEN 1 AND 31),
  ADD CONSTRAINT "payment_method_due_day" CHECK ("paymentDueDay" IS NULL OR "paymentDueDay" BETWEEN 1 AND 31);

ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "subscription_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "subscription_interval_positive" CHECK ("intervalCount" > 0),
  ADD CONSTRAINT "subscription_expiry_after_anchor" CHECK ("expiresOn" IS NULL OR "expiresOn" >= "anchorDate");
