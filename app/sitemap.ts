import type { MetadataRoute } from "next";
import { getCampaignCatalog } from "../lib/campaign-links";
import { siteUrl } from "../lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages: MetadataRoute.Sitemap = ["", "/deals", "/daftar", "/request-sample", "/privacy", "/terms"].map((path) => ({url:`${base}${path}`,lastModified:new Date(),changeFrequency:path==="/deals"?"daily":"weekly",priority:path===""?1:.7}));
  try {
    const [tiktok, shopee] = await Promise.all([getCampaignCatalog("tiktok"), getCampaignCatalog("shopee")]);
    const deals: MetadataRoute.Sitemap = [...tiktok, ...shopee].map((campaign) => {const parsed=campaign.updated?new Date(campaign.updated):new Date();return{url:`${base}/deal/${campaign.id}`,lastModified:Number.isNaN(parsed.getTime())?new Date():parsed,changeFrequency:"weekly",priority:.8};});
    return [...staticPages, ...deals];
  } catch { return staticPages; }
}
