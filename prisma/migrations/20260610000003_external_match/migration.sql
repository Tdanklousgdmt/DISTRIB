-- Sprint 5 : monitoring externe DSP (AudD). Table prévue par le doc master
-- (« un modèle ExternalMatch distinct sera ajouté au Sprint 5 »).

-- CreateTable
CREATE TABLE "ExternalMatch" (
    "id" TEXT NOT NULL,
    "vaultFileId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "album" TEXT,
    "externalUrl" TEXT,
    "isrc" TEXT,
    "score" DECIMAL(5,4),
    "raw" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalMatch_vaultFileId_platform_externalUrl_key"
    ON "ExternalMatch"("vaultFileId", "platform", "externalUrl");

-- CreateIndex
CREATE INDEX "ExternalMatch_vaultFileId_idx" ON "ExternalMatch"("vaultFileId");

-- CreateIndex
CREATE INDEX "ExternalMatch_detectedAt_idx" ON "ExternalMatch"("detectedAt");

-- AddForeignKey
ALTER TABLE "ExternalMatch"
    ADD CONSTRAINT "ExternalMatch_vaultFileId_fkey"
    FOREIGN KEY ("vaultFileId") REFERENCES "VaultFile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
