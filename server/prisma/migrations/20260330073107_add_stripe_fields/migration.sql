-- AlterTable
ALTER TABLE "EnterpriseVerification" ADD COLUMN     "stripeAccessToken" TEXT,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeLast30dRev" DOUBLE PRECISION,
ADD COLUMN     "stripeLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "stripeMomGrowth" DOUBLE PRECISION,
ADD COLUMN     "stripeMrr" DOUBLE PRECISION;
