-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('SUBSCRIPTION_RENEWAL', 'SUBSCRIPTION_EXPIRY', 'CANCELLATION_DEADLINE', 'CARD_PAYMENT_DUE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offsetsDays" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[],
    "renewalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expiryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cancellationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentDueEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "entityId" UUID NOT NULL,
    "eventDate" DATE NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");

-- CreateIndex
CREATE INDEX "notification_log_status_nextAttemptAt_idx" ON "notification_log"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_userId_kind_entityId_eventDate_offsetDays__key" ON "notification_log"("userId", "kind", "entityId", "eventDate", "offsetDays", "channel");

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth for values validated in the service layer.
ALTER TABLE "notification_preference"
  ADD CONSTRAINT "notification_preference_offsets_range"
    CHECK ("offsetsDays" <@ ARRAY[0, 1, 2, 3, 5, 7, 14, 30]);

ALTER TABLE "notification_log"
  ADD CONSTRAINT "notification_log_offset_range" CHECK ("offsetDays" BETWEEN 0 AND 30),
  ADD CONSTRAINT "notification_log_attempts_nonneg" CHECK ("attempts" >= 0);
