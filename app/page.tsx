import Link from "next/link";
import { getCampaignCatalog } from "../lib/catalog-db";
import type { Campaign } from "../lib/catalog";
import { getCurrentUser } from "../lib/auth";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import CampaignCatalog from "./components/CampaignCatalog";
import HeroVisual from "./components/HeroVisual";
import NewSkuHighlight from "./components/NewSkuHighlight";
import Icon from "./components/Icon";

// Katalog berubah setiap kali sheet disinkronkan, jadi halaman tidak dibekukan
// menjadi cuplikan kosong saat build.
export const dynamic = "force-dynamic";

async function loadCatalog(platform: "tiktok" | "shopee") {
  try {
    return await getCampaignCatalog(platform);
  } catch {
    // Katalog yang gagal dimuat tampil sebagai keadaan jujur, bukan angka karangan.
    return [] as Campaign[];
  }
}

export default async function HomePage() {
  const [tiktok, shopee, user] = await Promise.all([
    loadCatalog("tiktok"),
    loadCatalog("shopee"),
    getCurrentUser().catch(() => null),
  ]);
  const withSample = tiktok.filter((item) => item.hasSample === true).length;
  const totalCampaigns = tiktok.reduce((sum, item) => sum + item.campaignCount, 0);
  const catalogReady = tiktok.length > 0;
  // Kedua platform ikut, karena penandanya dipasang admin per platform dan
  // creator tidak sedang memilih platform saat melihat baris ini.
  const newSku = [...tiktok, ...shopee].filter((item) => item.newSku);

  return (
    <>
      <SiteHeader viewer={user ? { name: user.name } : null} />

      <main>
        <section className="hero shell">
          <div className="hero-inner">
            <p className="eyebrow">Haluan creator advantage</p>
            <h1>
              Rate lebih tinggi. <em>Khusus creator Haluan.</em>
            </h1>
            <p>
              Kami negosiasikan extra commission langsung dengan brand. Kamu tinggal pilih deal, buat konten, dan
              maksimalkan setiap penjualan.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/deals">
                Lihat {tiktok.length} brand <Icon name="arrow-down" />
              </Link>
              <Link className="btn btn-secondary" href="/daftar?mode=login">
                Masuk sebagai anggota
              </Link>
            </div>
          </div>

          <HeroVisual tiktokBrands={tiktok.length} tiktokCampaigns={totalCampaigns} shopeeBrands={shopee.length} />
        </section>

        {catalogReady ? (
          <section className="shell">
            <dl className="proof-bar">
              <div className="proof-item">
                <dt>brand dengan deal aktif</dt>
                <dd>{tiktok.length}</dd>
              </div>
              <div className="proof-item">
                <dt>campaign TikTok Shop</dt>
                <dd>{totalCampaigns}</dd>
              </div>
              <div className="proof-item">
                <dt>brand membuka request sample</dt>
                <dd>{withSample}</dd>
              </div>
              <div className="proof-item">
                <dt>biaya untuk creator Haluan</dt>
                <dd>0</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="shell section" id="cara-kerja">
          <p className="eyebrow">Dari scroll ke sales</p>
          <h2 style={{ fontSize: "var(--text-h2)", marginTop: "var(--space-2)" }}>
            Tiga langkah. Tanpa chat satu-satu.
          </h2>
          <div className="step-grid">
            <div className="step">
              <h3>Gabung MCN Haluan</h3>
              <p>Daftar dan hubungkan akun affiliate kamu dengan network Haluan.</p>
            </div>
            <div className="step">
              <h3>Buka akses campaign</h3>
              <p>Pilih campaign, akses link khusus, dan request sample jika tersedia.</p>
            </div>
            <div className="step">
              <h3>Buat konten &amp; jual</h3>
              <p>Publish konten seperti biasa. Komisi mengikuti ketentuan campaign.</p>
            </div>
          </div>
        </section>

        <NewSkuHighlight campaigns={newSku} />

        <section className="shell section" id="campaign">
          <div className="catalog-head">
            <div>
              <p className="eyebrow">Live opportunity board</p>
              <h2>Extra komisi yang siap kamu ambil.</h2>
              <p>
                Komisi yang ditampilkan adalah komisi terendah dari campaign brand tersebut. Link etalase dapat
                dilihat dan disalin tanpa login.
              </p>
            </div>
            <Link className="btn btn-secondary" href="/deals">
              Lihat semua {tiktok.length} deal <Icon name="arrow-up-right" />
            </Link>
          </div>

          {catalogReady ? (
            <CampaignCatalog campaigns={tiktok} variant="preview" previewLimit={12} />
          ) : (
            <div className="state-panel">
              <h3>Data campaign belum bisa dimuat</h3>
              <p>Coba muat ulang halaman ini sebentar lagi.</p>
              <Link className="btn btn-secondary" href="/">
                Muat ulang
              </Link>
            </div>
          )}
        </section>

        {shopee.length ? (
          <section className="shell section" id="campaign-shopee">
            <div className="catalog-head">
              <div>
                <p className="eyebrow">Campaign link &amp; benefit Shopee</p>
                <h2>Campaign Shopee yang sedang jalan.</h2>
                <p>
                  Sheet ini tidak memuat rate komisi. TAP hanya menampilkan benefit yang tersedia tanpa membuat angka
                  estimasi.
                </p>
              </div>
              <Link className="btn btn-secondary" href="/deals?platform=shopee">
                Lihat semua {shopee.length} campaign <Icon name="arrow-up-right" />
              </Link>
            </div>

            <CampaignCatalog campaigns={shopee} variant="preview" previewLimit={12} />
          </section>
        ) : null}

        <section className="shell section" id="faq">
          <p className="eyebrow">Sebelum mulai</p>
          <h2 style={{ fontSize: "var(--text-h2)", marginTop: "var(--space-2)" }}>Yang perlu kamu tahu.</h2>
          <p className="section-lede" style={{ marginTop: "var(--space-3)" }}>
            Jawaban singkat tentang komisi, akses link, dan request sample di TAP.
          </p>
          <div className="faq-list">
            <details>
              <summary>Kenapa komisinya ditulis &ldquo;mulai dari&rdquo;?</summary>
              <p>
                Satu brand sering punya beberapa campaign dengan komisi berbeda. Yang ditampilkan di kartu adalah yang
                paling kecil, supaya angka yang kamu lihat tidak lebih besar daripada yang kamu dapat. Komisi tiap
                campaign bisa dicek di halaman brand.
              </p>
            </details>
            <details>
              <summary>Apakah semua creator bisa membuka link deal?</summary>
              <p>
                Ya. Link etalase dapat dilihat, disalin, dan dibuka tanpa login. Login hanya diperlukan untuk request
                sample dan mengelola profil creator.
              </p>
            </details>
            <details>
              <summary>Apakah bergabung dan memakai TAP berbayar?</summary>
              <p>
                Tidak. Pendaftaran dan akses TAP gratis untuk creator Haluan. Ketentuan campaign tetap mengikuti
                platform dan brand terkait.
              </p>
            </details>
            <details>
              <summary>Apakah request sample pasti disetujui?</summary>
              <p>
                Tidak otomatis. Tim memeriksa kecocokan profil, brief, kuota, dan status membership sebelum menyetujui
                pengiriman.
              </p>
            </details>
            <details>
              <summary>Kenapa link harus dibuka melalui TAP?</summary>
              <p>
                TAP memastikan creator membuka link campaign yang masih aktif dan membantu tim melihat jumlah pembukaan
                setiap deal.
              </p>
            </details>
          </div>
        </section>

        <section className="shell">
          <div className="join-banner">
            <p className="eyebrow">Creator advantage starts here</p>
            <h2>Sudah bikin konten. Sekarang naikkan rate-nya.</h2>
            <p>Gabung bersama creator Haluan dan akses deal yang tidak tersedia di open plan.</p>
            <Link className="btn btn-primary" href="/daftar">
              Gabung sekarang <Icon name="arrow-up-right" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
