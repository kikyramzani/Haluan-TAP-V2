import Link from "next/link";
import { getCampaignCatalog } from "../lib/catalog-db";
import type { Campaign } from "../lib/catalog";
import { getCurrentUser } from "../lib/auth";
import { resolveArt } from "../lib/art-slot";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import CampaignCatalog from "./components/CampaignCatalog";
import HeroVisual from "./components/HeroVisual";
import NewSkuHighlight from "./components/NewSkuHighlight";
import Icon from "./components/Icon";
import ArtSlot from "./components/ArtSlot";
import FeatureGrid from "./components/FeatureGrid";
import type { Feature } from "./components/FeatureGrid";

// Di luar komponen supaya array-nya tidak dibangun ulang tiap render, dan
// supaya naskahnya terbaca sebagai satu daftar, bukan empat blok markup.
const KENAPA_TAP: readonly Feature[] = [
  {
    icon: "percent",
    title: "Extra commission",
    description: "Dinegosiasikan langsung dengan brand.",
  },
  {
    icon: "gift",
    title: "Request sample",
    description: "Untuk brand yang membukanya.",
  },
  {
    icon: "link-simple",
    title: "Link etalase",
    description: "Bisa dibuka tanpa login.",
  },
  {
    icon: "shield-check",
    title: "Gratis",
    description: "Tanpa biaya admin atau potongan.",
  },
];

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
  const joinArt = resolveArt("join-banner");
  const leadArt = resolveArt("kenapa-lead");
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
            {/* <em> membungkus SATU kata, bukan frasa: ia dirender sebagai pill
                berwarna di balik kata itu, dan pill yang membentang dua baris
                pecah jadi dua potongan. Kalimatnya sendiri tidak berubah. */}
            <h1>
              Rate lebih <em>tinggi.</em> Khusus creator Haluan.
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
                <i className="icon-tile icon-tile-sm" aria-hidden="true">
                  <Icon name="storefront" />
                </i>
                <dt>brand dengan deal aktif</dt>
                <dd>{tiktok.length}</dd>
              </div>
              <div className="proof-item">
                <i className="icon-tile icon-tile-sm" aria-hidden="true">
                  <Icon name="megaphone" />
                </i>
                <dt>campaign TikTok Shop</dt>
                <dd>{totalCampaigns}</dd>
              </div>
              <div className="proof-item">
                <i className="icon-tile icon-tile-sm" aria-hidden="true">
                  <Icon name="gift" />
                </i>
                <dt>brand membuka request sample</dt>
                <dd>{withSample}</dd>
              </div>
              <div className="proof-item">
                <i className="icon-tile icon-tile-sm" aria-hidden="true">
                  <Icon name="shield-check" />
                </i>
                <dt>biaya untuk creator Haluan</dt>
                <dd>0</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="shell section" id="cara-kerja">
          <div className="catalog-head">
            <div>
              <p className="eyebrow">Dari scroll ke sales</p>
              <h2>Tiga langkah. Tanpa chat satu-satu.</h2>
            </div>
          </div>
          <div className="step-grid">
            <div className="step">
              <i className="icon-tile"><Icon name="user-circle" /></i>
              <h3>Gabung MCN Haluan</h3>
              <p>Daftar dan hubungkan akun affiliate kamu dengan network Haluan.</p>
            </div>
            <div className="step">
              <i className="icon-tile"><Icon name="storefront" /></i>
              <h3>Buka akses campaign</h3>
              <p>Pilih campaign, akses link khusus, dan request sample jika tersedia.</p>
            </div>
            <div className="step">
              <i className="icon-tile"><Icon name="trend-up" /></i>
              <h3>Buat konten &amp; jual</h3>
              <p>Publish konten seperti biasa. Komisi mengikuti ketentuan campaign.</p>
            </div>
          </div>
        </section>

        {/*
          Empat ubin + tiga kartu manfaat. SEMUA klaimnya sudah dinyatakan di
          tempat lain pada situs ini. Extra commission dinegosiasikan (hero),
          gratis (/daftar), link etalase terbuka tanpa login (kepala katalog),
          request sample diperiksa tim (/request-sample). Tidak ada capability
          baru yang dikarang; GENERAL-WRITING-COPY-STYLE.md §9 melarangnya.

          Angka "500+ creator" dan deretan avatar dari mockup sengaja TIDAK
          dipakai: angkanya tidak terverifikasi dan wajahnya akan dikarang.
          Bukti angka di halaman ini tetap proof-bar di atas, yang dihitung dari
          database.
        */}
        <section className="shell section" id="kenapa-tap">
          <div className="catalog-head">
            <div>
              <p className="eyebrow">Kenapa lewat TAP</p>
              <h2>Yang kamu dapat sebagai creator Haluan.</h2>
            </div>
          </div>

          {/*
            Empat ubin yang sama, dipindah ke <FeatureGrid>: kisi bergaris
            putus-putus dengan pola samar di sudut tiap sel. Isinya TIDAK
            berubah satu kata pun — yang berganti hanya rupanya.
          */}
          <FeatureGrid features={KENAPA_TAP} />

          {/*
            Bobot bertingkat, mengikuti referensi: satu kartu unggulan melebar
            penuh dengan ilustrasi, lalu dua kartu biasa di bawahnya. Isiannya
            SOLID. §3.4 melarang dua bidang bergradasi bersentuhan, dan
            .info-card sebelumnya membawa --gradient-wash.
          */}
          <div className="info-grid">
            <article className="info-card info-card--filled info-card--lead">
              <div className="info-card-copy">
                <i className="icon-tile"><Icon name="crown-simple" /></i>
                <h3>Deal yang tidak ada di open plan</h3>
                <p>
                  Campaign dan rate yang dibuka brand khusus untuk network Haluan, bukan yang tersedia untuk publik.
                </p>
              </div>
              <ArtSlot src={leadArt} scene="exclusive" className="info-card-art" />
            </article>
            <article className="info-card info-card--filled info-card--deep">
              <i className="icon-tile"><Icon name="chart-line-up" /></i>
              <h3>Komisi terendah yang ditampilkan</h3>
              <p>
                Satu brand bisa punya beberapa campaign. Angka di kartu selalu yang paling kecil, supaya tidak lebih
                besar daripada yang kamu terima.
              </p>
            </article>
            <article className="info-card info-card--filled info-card--violet">
              <i className="icon-tile"><Icon name="users" /></i>
              <h3>Diperiksa tim sebelum dikirim</h3>
              <p>
                Request sample dicek profil, brief, dan kuotanya lebih dulu, lalu statusnya bisa kamu pantau di
                dashboard.
              </p>
            </article>
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
          <div className="catalog-head">
            <div>
              <p className="eyebrow">Sebelum mulai</p>
              <h2>Yang perlu kamu tahu.</h2>
              <p>Jawaban singkat tentang komisi, akses link, dan request sample di TAP.</p>
            </div>
          </div>
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
            <div className="join-banner-copy">
              <p className="eyebrow">
                Creator advantage <em>starts here</em>
              </p>
              <h2>
                Sudah bikin konten. <em>Sekarang naikkan</em> rate-nya.
              </h2>
              <p className="join-lede">Gabung bersama creator Haluan dan akses deal yang tidak tersedia di open plan.</p>
              <Link className="btn btn-primary" href="/daftar">
                Gabung sekarang <Icon name="arrow-up-right" />
              </Link>
              {/*
                Referensinya menaruh "500+ creator sudah bergabung" beserta deretan
                avatar di sini. Angka itu tidak terverifikasi dan wajahnya akan
                dikarang, jadi tempatnya diisi fakta yang memang sudah dinyatakan
                situs ini: gratis, tanpa biaya admin.
              */}
              <p className="join-trust">
                <Icon name="check" /> Gratis untuk creator Haluan, tanpa biaya admin.
              </p>
            </div>
            {/* Vektor sekarang, foto begitu tim menaruhnya di public/art/,
                lihat public/art/README.md. Tidak perlu ubah kode. */}
            <ArtSlot src={joinArt} scene="join" className="join-art" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
