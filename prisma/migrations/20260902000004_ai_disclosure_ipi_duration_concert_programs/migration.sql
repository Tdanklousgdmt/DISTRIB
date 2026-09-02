-- CreateEnum
CREATE TYPE "AiDisclosureCategory" AS ENUM ('VOIX', 'INSTRUMENTATION', 'COMPOSITION', 'POST_PRODUCTION', 'PAROLES');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SPLIT_SIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'SPLIT_INVALIDATED';
ALTER TYPE "NotificationType" ADD VALUE 'PENDING_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_DIGEST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SacemDeclarationType" ADD VALUE 'ADAMI_ATTESTATION';
ALTER TYPE "SacemDeclarationType" ADD VALUE 'SPEDIDAM_PRESENCE';

-- AlterTable
ALTER TABLE "Concert" ADD COLUMN     "performers" JSONB,
ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ipiCode" TEXT;

-- AlterTable
ALTER TABLE "VaultFile" ADD COLUMN     "aiCategories" "AiDisclosureCategory"[];

-- AlterTable
ALTER TABLE "Version" ADD COLUMN     "durationSeconds" INTEGER;

-- CreateTable
CREATE TABLE "ConcertProgram" (
    "id" TEXT NOT NULL,
    "artistUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "setlist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConcertProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConcertProgram_reference_key" ON "ConcertProgram"("reference");

-- CreateIndex
CREATE INDEX "ConcertProgram_artistUserId_idx" ON "ConcertProgram"("artistUserId");

-- AddForeignKey
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ConcertProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcertProgram" ADD CONSTRAINT "ConcertProgram_artistUserId_fkey" FOREIGN KEY ("artistUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
