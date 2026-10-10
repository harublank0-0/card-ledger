-- AlterTable
ALTER TABLE "subscription" ADD COLUMN "expiresOnBeforeCancel" DATE;

-- Plans that are cancelled already keep today's behaviour: reactivating them restores the end
-- date they have now, exactly as before this column existed.
UPDATE "subscription" SET "expiresOnBeforeCancel" = "expiresOn" WHERE "status" = 'CANCELLED';
