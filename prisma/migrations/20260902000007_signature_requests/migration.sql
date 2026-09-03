-- CreateEnum
CREATE TYPE "SignatureProviderKind" AS ENUM ('LOCAL', 'YOUSIGN');

-- CreateEnum
CREATE TYPE "SignatureLevel" AS ENUM ('SIMPLE', 'ADVANCED', 'QUALIFIED');

-- CreateEnum
CREATE TYPE "SignatureRequestKind" AS ENUM ('SPLITS', 'DECLARATION');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignatureSignerStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED');

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "kind" "SignatureRequestKind" NOT NULL,
    "provider" "SignatureProviderKind" NOT NULL,
    "level" "SignatureLevel" NOT NULL,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "versionId" TEXT,
    "declarationId" TEXT,
    "documentKey" TEXT NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "signedDocumentKey" TEXT,
    "signedDocumentSha256" TEXT,
    "externalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureSigner" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "SignatureSignerStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentText" TEXT,
    "signatureImage" TEXT,
    "externalId" TEXT,
    "signatureLink" TEXT,

    CONSTRAINT "SignatureSigner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_externalId_key" ON "SignatureRequest"("externalId");

-- CreateIndex
CREATE INDEX "SignatureRequest_versionId_status_idx" ON "SignatureRequest"("versionId", "status");

-- CreateIndex
CREATE INDEX "SignatureRequest_declarationId_status_idx" ON "SignatureRequest"("declarationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureSigner_requestId_userId_key" ON "SignatureSigner"("requestId", "userId");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "SacemDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureSigner" ADD CONSTRAINT "SignatureSigner_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureSigner" ADD CONSTRAINT "SignatureSigner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

