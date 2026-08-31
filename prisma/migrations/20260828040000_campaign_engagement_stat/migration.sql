-- CreateEnum
CREATE TYPE "CampaignHotBadge" AS ENUM ('TOP_BRAND', 'TRENDING', 'HIGH_CONVERSION', 'HIGH_DEMAND');

-- CreateTable
CREATE TABLE "CampaignEngagementStat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clicks7d" INTEGER NOT NULL DEFAULT 0,
    "sampleRequests30d" INTEGER NOT NULL DEFAULT 0,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "conversionRatePct" DECIMAL(65,30),
    "badge" "CampaignHotBadge",
    "recomputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignEngagementStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignEngagementStat_campaignId_key" ON "CampaignEngagementStat"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignEngagementStat_badge_idx" ON "CampaignEngagementStat"("badge");

-- AddForeignKey
ALTER TABLE "CampaignEngagementStat" ADD CONSTRAINT "CampaignEngagementStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
