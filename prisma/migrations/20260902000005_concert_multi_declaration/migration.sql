-- DropIndex
DROP INDEX "SacemDeclaration_concertId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SacemDeclaration_concertId_type_key" ON "SacemDeclaration"("concertId", "type");

