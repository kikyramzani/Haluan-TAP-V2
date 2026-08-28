-- AlterTable
ALTER TABLE "SampleRequest" ADD COLUMN     "commitment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "picName" TEXT,
ADD COLUMN     "picPhone" TEXT,
ADD COLUMN     "preferredSample" TEXT,
ADD COLUMN     "profileUrl" TEXT,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "sow" TEXT,
ADD COLUMN     "username" TEXT;
