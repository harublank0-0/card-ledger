-- DropForeignKey
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_paymentMethodId_fkey";

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_method"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
