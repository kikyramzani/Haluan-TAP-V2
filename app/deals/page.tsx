import type { Metadata } from "next";
import Link from "next/link";
import { getCampaignCatalog } from "../../lib/catalog-db";
import type { Campaign } from "../../lib/catalog";
import { getCurrentUser } from "../../lib/auth";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import CampaignCatalog from "../components/CampaignCatalog";
import PlatformMark from "../components/PlatformMark";

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
  // Peta per platform, bukan satu skalar `other`. Yang lama menuliskan
  // "hanya ada dua platform" ke dalam alur datanya sendiri, jadi kartu ketiga
  // apa pun akan memaksa membongkarnya lagi.
  const counts: Record<string, number> = { tiktok: 0, shopee: 0 };
  let failed = false;
  try {
    const [current, alternate] = await Promise.all([
      getCampaignCatalog(platform),
      getCampaignCatalog(platform === "shopee" ? "tiktok" : "shopee"),
    ]);
    campaigns = current;
    counts[platform] = current.length;
    counts[platform === "shopee" ? "tiktok" : "shopee"] = alternate.length;
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

          {/*
            Dua kartu platform, menggantikan empat ubin pintasan yang dulu ada di
            sini. Isiannya SOLID, bukan gradasi: §3.4 membatasi satu Haluan Hot per
            viewport dan melarang dua bidang bergradasi bersentuhan.

            Tetap <Link> dengan aria-current, bukan role="button". <a> hanya
            merespons ENTER, dan mengumumkannya sebagai tombol menjanjikan SPASI
            yang tidak pernah bekerja.
          */}
          <div className="platform-cards" role="group" aria-label="Pilih platform">
            <Link
              className="platform-card platform-card--tiktok"
              href="/deals"
              aria-current={platform === "tiktok" ? "page" : undefined}
            >
              <i className="platform-card-icon"><PlatformMark name="tiktok" /></i>
              <b>TikTok Shop</b>
              <span>{counts.tiktok} deal live</span>
            </Link>
            <Link
              className="platform-card platform-card--shopee"
              href="/deals?platform=shopee"
              aria-current={platform === "shopee" ? "page" : undefined}
            >
              <i className="platform-card-icon"><PlatformMark name="shopee" /></i>
              <b>Shopee Affiliate</b>
              <span>{counts.shopee} campaign live</span>
            </Link>
            {/*
              Lazada belum punya campaign satu pun, jadi kartunya BUKAN tautan:
              tidak ada tujuan yang berguna untuk dibuka. <span>, bukan <a>
              aria-disabled — tautan mati tetap bisa difokus dan diklik, dan
              mengumumkannya nonaktif sambil membiarkannya bekerja adalah bug
              yang sama seperti pada pagination admin.

              Inisial, bukan tanda resmi: belum ada mark Lazada monokrom
              berbentuk persegi dari sumber yang diizinkan
              BRAND-LOGO-SOURCES.md, dan wordmark lebar tidak muat di slot 44px
              bersama dua glyph persegi.
            */}
            <span className="platform-card platform-card--soon">
              <i className="platform-card-icon" aria-hidden="true">LZ</i>
              <b>Lazada</b>
              <span>Segera hadir</span>
            </span>
          </div>
        </section>

        <section className="shell deals-results">
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
              platform={platform}
            />
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
