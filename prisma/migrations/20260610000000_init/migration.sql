-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContributorRole" AS ENUM ('ARTIST', 'CO_AUTHOR', 'BEATMAKER', 'CO_BEATMAKER');

-- CreateEnum
CREATE TYPE "UserProfileFlag" AS ENUM ('AUTEUR', 'INTERPRETE', 'PRODUCTEUR');

-- CreateEnum
CREATE TYPE "VaultFileType" AS ENUM ('WAV', 'FLP', 'ALS', 'PTX', 'STEM', 'LYRICS', 'OTHER');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConcertStatus" AS ENUM ('SCHEDULED', 'DECLARED', 'PAID');

-- CreateEnum
CREATE TYPE "SacemDeclarationType" AS ENUM ('OEUVRE', 'LIVE');

-- CreateEnum
CREATE TYPE "SacemDeclarationStatus" AS ENUM ('PENDING_SIGNATURE', 'SIGNED', 'TRANSMITTED', 'PAID');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'SPLIT_NEGOTIATED', 'DISPUTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ClaimResolutionAction" AS ENUM ('AUTHORIZE', 'NEGOTIATE_SPLIT', 'REPORT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPROVAL_REQUESTED', 'VERSION_APPROVED', 'VERSION_REJECTED', 'CLAIM_DETECTED', 'CONCERT_REMINDER_J15', 'CONCERT_REMINDER_J5', 'CONCERT_REMINDER_J1', 'SACEM_SIGNED', 'PAYMENT_RECEIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "profileFlags" "UserProfileFlag"[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isrc" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "onchainProjectId" TEXT,
    "registerTxHash" TEXT,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "publishBlockedReason" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContributor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ContributorRole" NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VersionStatus" NOT NULL DEFAULT 'PENDING',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "initialPolygonTxHash" TEXT,
    "finalPolygonTxHash" TEXT,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultFile" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileType" "VaultFileType" NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT,
    "s3Bucket" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3VersionId" TEXT,
    "objectLockRetainUntil" TIMESTAMP(3),
    "sha256Hash" TEXT NOT NULL,
    "polygonTxHash" TEXT,
    "fingerprintComputedAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "signatureTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Split" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "roleLabel" TEXT,
    "signedAt" TIMESTAMP(3),
    "yousignSignatureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Split_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concert" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "artistUserId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "estimatedAudience" INTEGER,
    "actualAudience" INTEGER,
    "setlist" JSONB,
    "status" "ConcertStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sacemReference" TEXT,
    "reminderJ15SentAt" TIMESTAMP(3),
    "reminderJ5SentAt" TIMESTAMP(3),
    "reminderJ1SentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacemDeclaration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "versionId" TEXT,
    "concertId" TEXT,
    "type" "SacemDeclarationType" NOT NULL,
    "status" "SacemDeclarationStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "pdfS3Bucket" TEXT,
    "pdfS3Key" TEXT,
    "sacemReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "amountReceivedCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SacemDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fingerprint" (
    "id" TEXT NOT NULL,
    "vaultFileId" TEXT NOT NULL,
    "chromaprint" BYTEA NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'chromaprint-1.5',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "targetFileId" TEXT NOT NULL,
    "claimantFileId" TEXT NOT NULL,
    "similarityScore" DECIMAL(5,4) NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "resolutionAction" "ClaimResolutionAction",
    "onchainPendingClaimTx" TEXT,
    "resolutionTxHash" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Project_isrc_key" ON "Project"("isrc");

-- CreateIndex
CREATE UNIQUE INDEX "Project_onchainProjectId_key" ON "Project"("onchainProjectId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "ProjectContributor_userId_idx" ON "ProjectContributor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContributor_projectId_userId_key" ON "ProjectContributor"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Version_projectId_isCurrent_idx" ON "Version"("projectId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Version_projectId_versionNumber_key" ON "Version"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VaultFile_sha256Hash_key" ON "VaultFile"("sha256Hash");

-- CreateIndex
CREATE INDEX "VaultFile_versionId_idx" ON "VaultFile"("versionId");

-- CreateIndex
CREATE INDEX "VaultFile_sha256Hash_idx" ON "VaultFile"("sha256Hash");

-- CreateIndex
CREATE INDEX "Approval_reviewerId_idx" ON "Approval"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_versionId_contributorId_key" ON "Approval"("versionId", "contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "Split_versionId_contributorId_key" ON "Split"("versionId", "contributorId");

-- CreateIndex
CREATE INDEX "Concert_artistUserId_date_idx" ON "Concert"("artistUserId", "date");

-- CreateIndex
CREATE INDEX "Concert_date_status_idx" ON "Concert"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SacemDeclaration_concertId_key" ON "SacemDeclaration"("concertId");

-- CreateIndex
CREATE INDEX "SacemDeclaration_type_status_idx" ON "SacemDeclaration"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Fingerprint_vaultFileId_key" ON "Fingerprint"("vaultFileId");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_targetFileId_idx" ON "Claim"("targetFileId");

-- CreateIndex
CREATE INDEX "Claim_claimantFileId_idx" ON "Claim"("claimantFileId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContributor" ADD CONSTRAINT "ProjectContributor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContributor" ADD CONSTRAINT "ProjectContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFile" ADD CONSTRAINT "VaultFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFile" ADD CONSTRAINT "VaultFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "ProjectContributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Split" ADD CONSTRAINT "Split_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Split" ADD CONSTRAINT "Split_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "ProjectContributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concert" ADD CONSTRAINT "Concert_artistUserId_fkey" FOREIGN KEY ("artistUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacemDeclaration" ADD CONSTRAINT "SacemDeclaration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacemDeclaration" ADD CONSTRAINT "SacemDeclaration_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacemDeclaration" ADD CONSTRAINT "SacemDeclaration_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fingerprint" ADD CONSTRAINT "Fingerprint_vaultFileId_fkey" FOREIGN KEY ("vaultFileId") REFERENCES "VaultFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_targetFileId_fkey" FOREIGN KEY ("targetFileId") REFERENCES "VaultFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_claimantFileId_fkey" FOREIGN KEY ("claimantFileId") REFERENCES "VaultFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
