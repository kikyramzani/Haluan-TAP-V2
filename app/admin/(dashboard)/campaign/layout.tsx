import type { ReactNode } from "react";
import CampaignTabs from "./CampaignTabs";

export default function CampaignLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CampaignTabs />
      {children}
    </>
  );
}
