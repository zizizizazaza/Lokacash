/*
  Warnings:

  - You are about to drop the column `stripeAccessToken` on the `EnterpriseVerification` table. All the data in the column will be lost.
  - You are about to drop the column `stripeAccountId` on the `EnterpriseVerification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EnterpriseVerification" DROP COLUMN "stripeAccessToken",
DROP COLUMN "stripeAccountId",
ADD COLUMN     "stripeApiKeyEncrypted" TEXT,
ADD COLUMN     "stripeKeyStatus" TEXT;
