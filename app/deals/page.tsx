import type { Metadata } from "next";
import Link from "next/link";
import { getCampaignCatalog } from "../../lib/campaign-links";
import type { Campaign } from "../../lib/catalog";
import { getCurrentUser } from "../../lib/auth";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import CampaignCatalog from "../components/CampaignCatalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Semua deal · TAP by Haluan",
  description:
    "Temukan extra commission TikTok dan campaign affiliate Shopee khusus creator Haluan.",
  alternates: { canonical: "/deals" },
};

type Props = { searchParams: Promise<{ platform?: string; q?: string; kategori?: string }> };

export default async function DealsPage({ searchParams }: Props) {
  const params = await searchParams;
  const platform = params.platform?.toLowerCase() === "shopee" ? "shopee" : "tiktok";

  let campaigns: Campaign[] = [];
  let other = 0;
  let failed = false;
  try {
    const [current, alternate] = await Promise.all([
      getCampaignCatalog(platform),
      getCampaignCatalog(platform === "shopee" ? "tiktok" : "shopee"),
    ]);
    campaigns = current;
    other = alternate.length;
  } catch {
    failed = true;
  }
  const user = await getCurrentUser().catch(() => null);

  return (
    <>
      <SiteHeader variant="subpage" viewer={user ? { name: user.name } : null} />

      <main>
        <section className="subpage-hero shell">
          <p className="eyebrow">Live opportunity board</p>
          <h1>Semua deal. Satu tempat.</h1>
          <p>Temukan extra commission TikTok dan campaign affiliate Shopee khusus creator Haluan.</p>
          <p className="platform-note">
            {platform === "shopee"
              ? "Campaign link & benefit Shopee. Sheet ini tidak memuat rate komisi. TAP hanya menampilkan benefit yang tersedia tanpa membuat angka estimasi."
              : "Komisi yang ditampilkan adalah komisi terendah dari seluruh campaign brand tersebut."}
          </p>

          <div className="filter-row" style={{ marginTop: "var(--space-6)" }}>
            <div className="filter-chips" role="group" aria-label="Pilih platform">
              <Link
                className="chip"
                href="/deals"
                aria-pressed={platform === "tiktok"}
                role="button"
              >
TikTok Shop <span className="chip-count">{platform === "tiktok" ? campaigns.length : other} deal live</span>
              </Link>
              <Link
                className="chip"
                href="/deals?platform=shopee"
                aria-pressed={platform === "shopee"}
                role="button"
              >
Shopee Affiliate <span className="chip-count">{platform === "shopee" ? campaigns.length : other} campaign live</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="shell" style={{ paddingBottom: "var(--space-16)" }}>
          {failed ? (
            <div className="state-panel">
              <h3>Data campaign belum bisa dimuat</h3>
              <p>Coba muat ulang halaman ini sebentar lagi.</p>
              <Link className="btn btn-secondary" href="/deals">
                Coba lagi
              </Link>
            </div>
          ) : (
            <CampaignCatalog
              key={platform}
              campaigns={campaigns}
              initialQuery={params.q ?? ""}
              initialCategory={params.kategori ?? ""}
            />
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
