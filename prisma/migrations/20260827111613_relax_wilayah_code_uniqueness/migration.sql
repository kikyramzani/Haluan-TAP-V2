-- DropIndex
DROP INDEX "District_code_key";

-- DropIndex
DROP INDEX "Regency_code_key";

-- DropIndex
DROP INDEX "Village_code_key";

-- CreateIndex
CREATE INDEX "District_code_idx" ON "District"("code");

-- CreateIndex
CREATE INDEX "Regency_code_idx" ON "Regency"("code");

-- CreateIndex
CREATE INDEX "Village_code_idx" ON "Village"("code");
