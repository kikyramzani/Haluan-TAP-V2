import { datastoreReady } from "../../../lib/redis";
import { campaignLinkSourceReady, shopeeCampaignSourceReady } from "../../../lib/campaign-links";

export async function GET(){
  const checks={datastore:datastoreReady(),campaignLinks:await campaignLinkSourceReady(),shopeeCampaigns:await shopeeCampaignSourceReady(),googleOAuth:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),adminAllowlist:Boolean(process.env.ADMIN_EMAILS)};
  const critical=checks.datastore&&checks.campaignLinks&&checks.shopeeCampaigns&&checks.adminAllowlist;
  return Response.json({status:critical?"ready":"configuration_required"},{status:critical?200:503,headers:{"cache-control":"no-store"}});
}
