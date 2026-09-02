-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SPLIT_SIGNATURE_REQUESTED';

-- AlterTable
ALTER TABLE "ProjectContributor" ADD COLUMN     "inviteToken" TEXT;

-- AlterTable
ALTER TABLE "Version" ADD COLUMN     "depositRole" "ContributorRole",
ADD COLUMN     "depositRoleDetail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContributor_inviteToken_key" ON "ProjectContributor"("inviteToken");

