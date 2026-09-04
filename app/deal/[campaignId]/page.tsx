import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pickPrimaryLink } from "../../../lib/campaign-links";
import { getCampaignCatalog, getTapLinks } from "../../../lib/catalog-db";
import { formatCommission } from "../../../lib/commission";
import { classifyExpiry, expiryLabel, isActionable } from "../../../lib/campaign-flags";
import { getCurrentUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import AffiliateLinkField from "../../components/AffiliateLinkField";
import BrandMark from "../../components/BrandMark";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import ShareDealButton from "../ShareDealButton";
import SaveCampaignButton from "./SaveCampaignButton";
import Icon from "../../components/Icon";

type DealPageProps = { params: Promise<{ campaignId: string }> };

export async function generateMetadata({ params }: DealPageProps): Promise<Metadata> {
  const { campaignId } = await params;
  try {
    const links = await getTapLinks(campaignId);
    if (!links.length) return {};
    const brand = links[0].brand;
    const platform = campaignId.startsWith("shopee-") ? "Shopee" : "TikTok";
    const title = `${brand} · Campaign ${platform} | TAP by Haluan`;
    const description = `Lihat campaign ${brand}, komisi creator, dan ketersediaan sample support di TAP by Haluan.`;
    const url = `/deal/${campaignId}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, images: [{ url: "/og.jpg", width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
    };
  } catch {
    return {};
  }
}

export default async function DealDetail({ params }: DealPageProps) {
  const { campaignId } = await params;
  const sourcePlatform = campaignId.startsWith("shopee-") ? "shopee" : "tiktok";

  let links: Awaited<ReturnType<typeof getTapLinks>> = [];
  let campaign: Awaited<ReturnType<typeof getCampaignCatalog>>[number] | undefined;
  try {
    [links, campaign] = await Promise.all([
      getTapLinks(campaignId),
      getCampaignCatalog(sourcePlatform).then((items) => items.find((item) => item.id === campaignId)),
    ]);
  } catch {
    redirect("/deals?error=system_unavailable");
  }
  if (!links.length) redirect("/deals?error=deal_unavailable");

  const brand = campaign?.brand ?? links[0].brand;
  const hasSample = campaign?.hasSample ?? (links.some((link) => link.hasSample) ? true : null);
  const platform = sourcePlatform === "shopee" ? "Shopee" : "TikTok";
  const primary = pickPrimaryLink(links);
  // Tanggal dinilai lewat aturan yang sama dengan kartu brand. Sebelumnya string
  // mentah dicetak apa adanya, jadi tanggal yang sudah lewat pun tetap tampil
  // seolah campaign masih berjalan.
  const expiresAt = campaign?.expiresAt ?? links.find((link) => link.expiresAt)?.expiresAt ?? null;
  const expiry = classifyExpiry(expiresAt);
  const expiryNote = expiryLabel(expiry);
  const stillRunning = isActionable(expiry);
  const user = await getCurrentUser().catch(() => null);

  // Bookmarking (SavedCampaign) keys off the real Prisma Campaign.id, not the
  // slug this route uses. Resolved once here, cheaply, alongside whether
  // this viewer already saved this exact campaign.
  let savedCampaignState: { campaignId: string; initialSaved: boolean } | null = null;
  try {
    const campaignRow = await prisma.campaign.findUnique({ where: { slug: campaignId }, select: { id: true } });
    if (campaignRow) {
      let initialSaved = false;
      if (user) {
        const creator = await prisma.creator.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (creator) {
          const saved = await prisma.savedCampaign.findUnique({
            where: { creatorId_campaignId: { creatorId: creator.id, campaignId: campaignRow.id } },
            select: { id: true },
          });
          initialSaved = Boolean(saved);
        }
      }
      savedCampaignState = { campaignId: campaignRow.id, initialSaved };
    }
  } catch {
    savedCampaignState = null;
  }

  return (
    <>
      <SiteHeader variant="subpage" viewer={user ? { name: user.name } : null} />

      {/**
       * Seluruh tata letak halaman ini ada di catalog.css sebagai .deal-detail*.
       *
       * Sebelumnya ia ditata lewat dua belas atribut `style` inline dan tidak
       * punya satu pun kelas sendiri. Konsekuensinya bukan cuma soal rapi:
       * gaya inline tidak bisa dijangkau media query maupun tema, jadi halaman
       * ini adalah satu-satunya permukaan publik yang tidak bisa diberi
       * perlakuan mobile atau diganti tokennya tanpa menyunting TSX-nya.
       */}
      <main className="shell deal-detail">
        <Link className="btn btn-ghost" href={`/deals${platform === "Shopee" ? "?platform=shopee" : ""}`}>
          <Icon name="arrow-left" /> Semua deal
        </Link>

        <header className="deal-detail-head">
          <BrandMark brand={brand} logoOverride={campaign?.image} size={64} />
          <div>
            <p className="eyebrow">{platform} campaign</p>
            <h1>{brand}</h1>
            <p className="deal-detail-meta">
              {campaign?.category ?? "Campaign affiliate"} · {campaign?.platform ?? "TikTok Shop"}
            </p>
          </div>
        </header>

        <dl className="sheet-metrics deal-detail-metrics">
          <div className="metric-tile">
            <dt>Komisi creator</dt>
            <dd>{formatCommission(campaign?.commission ?? null)}</dd>
          </div>
          {/* metric-tile-text: nilainya kalimat, bukan angka, jadi ia tidak
              memakai ukuran display milik ubin metrik. Sebelumnya tiga ubin ini
              memakai tiga ukuran berbeda — --text-lead dua kali dan 17px sekali,
              yang tidak berasal dari tangga mana pun. */}
          <div className="metric-tile metric-tile-text">
            <dt>Status campaign</dt>
            <dd>{stillRunning ? "Masih berjalan" : "Sudah berakhir"}</dd>
          </div>
          {hasSample !== null ? (
            <div className="metric-tile metric-tile-text metric-tile-wide">
              <dt>Sample</dt>
              <dd>{hasSample ? "Sample tersedia" : "Belum tersedia"}</dd>
            </div>
          ) : null}
          {expiresAt ? (
            <div className="metric-tile metric-tile-text metric-tile-wide">
              <dt>Berlaku hingga</dt>
              <dd>
                {expiresAt}
                {expiryNote ? <span className="metric-note">{expiryNote}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {campaign && campaign.campaignCount > 1 ? (
          <p className="deal-detail-note">
            Brand ini punya beberapa campaign dengan komisi berbeda. Yang dibagikan di sini adalah campaign dengan
            komisi terendah, sama dengan angka di atas.
          </p>
        ) : null}

        <section className="deal-detail-section">
          <h2>Link affiliate</h2>
          <p>Salin linknya atau buka langsung etalasenya. Link ini dapat diakses tanpa login.</p>
          {primary ? <AffiliateLinkField url={primary.url} openUrl={`/go/${campaignId}`} /> : null}
        </section>

        {hasSample ? (
          <section className="panel deal-detail-section deal-detail-sample">
            <h2>Perlu produk untuk membuat konten?</h2>
            <p>Login untuk mengajukan sample dan memantau statusnya.</p>
            <Link
              className="btn btn-primary"
              href={`/request-sample?brand=${encodeURIComponent(brand)}&platform=${platform}`}
            >
              Request sample <Icon name="arrow-up-right" />
            </Link>
          </section>
        ) : null}

        <div className="deal-detail-actions">
          <ShareDealButton brand={brand} />
          {savedCampaignState ? (
            <SaveCampaignButton
              campaignId={savedCampaignState.campaignId}
              initialSaved={savedCampaignState.initialSaved}
              isSignedIn={Boolean(user)}
              returnTo={`/deal/${campaignId}`}
            />
          ) : null}
        </div>

        <p className="deal-detail-fineprint">
          Ketersediaan link dan benefit dapat berubah mengikuti periode campaign di platform.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
