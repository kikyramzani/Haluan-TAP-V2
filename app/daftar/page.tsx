import AuthClient from "./AuthClient";
import { getCampaignBrandCount } from "../../lib/catalog-db";
import { authEmailEnabled } from "../../lib/email-auth";

export const dynamic = "force-dynamic";

export default async function DaftarPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const initialMode = params.mode === "login" || params.mode === "activate" ? "login" : "register";
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  let initialDealCount: number | null = null;
  try {
    initialDealCount = await getCampaignBrandCount("tiktok");
  } catch {
    initialDealCount = null;
  }
  return <AuthClient googleEnabled={googleEnabled} emailVerificationEnabled={authEmailEnabled()} initialDealCount={initialDealCount} initialMode={initialMode}/>;
}
