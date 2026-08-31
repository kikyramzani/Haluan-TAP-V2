# TAP by Haluan — Spesifikasi Desain untuk Stitch

Dokumen ini berisi seluruh sistem TAP by Haluan dalam bentuk yang siap dipakai untuk membuat prototype di Google Stitch: design system, inventaris komponen, peta alur, dan 27 layar yang masing-masing punya blok prompt siap salin-tempel.

Semua isi diambil dari kode yang berjalan. Copy UI dikutip apa adanya, bukan ditulis ulang.

---

## 0. Cara pakai dokumen ini

**Alur kerja di Stitch:**

1. Buka sesi baru di Stitch, pilih mode **Mobile** atau **Web** sesuai layar yang dituju.
2. Tempel **Prompt Design System** (akhir Bagian 2) sebagai prompt pertama. Ini mengunci palet, tipografi, dan gaya visual untuk sisa sesi.
3. Tempel prompt layar satu per satu dari Bagian 5. Setiap prompt berdiri sendiri, jadi urutannya bebas dan tetap benar meski Stitch kehilangan konteks.
4. Untuk varian layar (misal kartu TikTok vs Shopee), jalankan prompt utamanya dulu, lalu kirim kalimat penyesuaian sebagai prompt lanjutan.

**Yang biasanya perlu dikoreksi manual setelah Stitch menghasilkan layar:**

| Bagian | Kenapa perlu dicek |
|---|---|
| Warna tombol utama | Stitch cenderung memilih pink terang `#eb1487`. Yang benar adalah pink-deep `#d81280` — lihat catatan kontras di Bagian 2. |
| Font display | Archivo sering diganti Inter atau Poppins. Judul harus Archivo, body boleh sans-serif sistem. |
| Radius | Stitch sering menyamakan semua radius. Sistem ini memakai 4 tingkat + pil khusus badge. |
| Aksen platform | TikTok dan Shopee hanya boleh jadi **garis tepi tipis** di kartu katalog, bukan isian penuh. |
| Angka mock | Ganti angka karangan Stitch dengan angka nyata dari Lampiran 6.3. |

**Yang tidak perlu diprototipekan:** halaman legal (`/privacy`, `/terms`), halaman error (`not-found`, `global-error`), dan endpoint API/redirect (`/go/[campaignId]`, `/api/*`). Semuanya tanpa desain khusus.

### Peta lengkap route → layar

Setiap `page.tsx` di repo ada di tabel ini. Kalau ada route baru ditambahkan ke aplikasi, tabel ini yang dicek lebih dulu.

| Route | Layar |
|---|---|
| `/` | S-01 |
| `/deals` | S-02 (modal katalog = S-03) |
| `/deal/[campaignId]` | S-04 |
| `/request-sample` | S-05 |
| `/daftar` | S-06 |
| `/daftar/lengkapi` | S-07 |
| `/dashboard` | S-08 (shell = S-14) |
| `/dashboard/sample` | S-09 |
| `/dashboard/tersimpan` | S-10 |
| `/dashboard/performa` | S-11 |
| `/dashboard/notifikasi` | S-12 |
| `/dashboard/profil` | S-13 |
| `/admin` | S-15 |
| `/admin/brand` | S-16 |
| `/admin/brand/[id]` · `/admin/brand/new` | S-17 |
| `/admin/campaign` | S-18 |
| `/admin/campaign/[id]` · `/admin/campaign/new` | S-19 |
| `/admin/produk` · `/admin/link` | S-20 |
| `/admin/kategori` | S-21 |
| `/admin/creator` | S-22 |
| `/admin/creator/[id]` | S-23 |
| `/admin/sample` · `/admin/sample/[id]` | S-24 |
| `/admin/analitik` | S-25 |
| `/admin/pengguna` · `/admin/audit` · `/admin/import` | S-26 |
| `/admin/login` | S-27 |
| `/privacy` · `/terms` | sengaja dilewati |

---

## 1. Ringkasan produk

**TAP by Haluan** adalah microsite creator enablement milik Haluan Digital Network. Dua fungsi utamanya:

1. Menampilkan campaign affiliate beserta extra commission yang dinegosiasikan Haluan dengan brand.
2. Menerima request sample produk dari creator yang sudah terverifikasi.

Target domain: `tap.haluandigital.agency`. Mobile-first, dapat dipasang sebagai PWA standalone (tanpa service worker — angka komisi tidak boleh tampil dari cache basi).

### 1.1 Dua platform, dua bentuk kartu

Ini pembeda paling penting dan paling sering salah kalau prototype dibuat dari asumsi:

| | TikTok Shop | Shopee Affiliate |
|---|---|---|
| Kolom komisi di sumber data | Ada | **Tidak ada sama sekali** |
| Angka utama di kartu | Persentase komisi terendah brand tersebut | Tidak ada angka — kartu dipimpin daftar benefit |
| Label komisi | "Komisi creator · mulai dari" | "Ketentuan platform" |
| Benefit yang mungkin tampil | Sample tersedia, New SKU, tanggal berakhir | Komisi Special, Sample tersedia, Harga live khusus |
| Filter band komisi & sort komisi | Tersedia | Disembunyikan |
| Aksen garis tepi kartu | Teal `#1fd8d1` | Oranye `#f2652f` |

Aturannya: **TAP tidak pernah mengarang angka rate untuk Shopee.** Menampilkan "—" besar di kartu Shopee juga salah, karena terbaca seperti data gagal dimuat padahal angkanya memang tidak pernah ada.

### 1.2 Tiga peran

| Peran | Akses | Layar |
|---|---|---|
| Publik (belum login) | Katalog, detail deal, link affiliate, salin & buka link | S-01 s/d S-07 |
| Creator (`CREATOR`) | Dashboard, request sample, profil, performa, notifikasi | S-08 s/d S-14 |
| Admin (`ADMIN`) | Workspace operasional: brand, campaign, creator, sample, analitik | S-15 s/d S-25, S-27 |
| Super Admin (`SUPER_ADMIN`) | Semua akses admin + pengguna, audit log, import data | S-26 |

**Aturan akses yang menentukan tampilan:**

- Link etalase per campaign **sengaja publik**. Bisa dilihat, disalin, dan dibuka tanpa login.
- Login hanya diperlukan untuk request sample dan fitur creator.
- Request sample butuh membership `VERIFIED`, bukan sekadar akun terdaftar.
- Dashboard baru bisa diakses setelah onboarding (`/daftar/lengkapi`) selesai.

### 1.3 Status implementasi yang harus jujur di prototype

| Fitur | Status |
|---|---|
| Google OAuth | Sudah diimplementasikan, sengaja ditunda. Tombol Google **disembunyikan** sampai credential production tersedia. |
| Hot Deals | Rail-nya nyata, tapi kosong sampai ada trafik klik/save/request nyata. Badge tidak pernah diisi placeholder. |
| Product of the Week / product intelligence | Belum menampilkan pemenang atau angka. Belum ada layarnya. |
| New SKU | Penandanya dipasang admin lewat CMS. Kosong sampai ada yang benar-benar ditandai. |

---

## 2. Design system

Sumber tunggal: [app/styles/tokens.css](app/styles/tokens.css). Palet mengikuti hcommerce.id.

### 2.1 Permukaan

| Token | Gelap | Terang |
|---|---|---|
| `--bg` | `#08080a` | `#ffffff` |
| `--surface` | `#0c0c11` | `#ffffff` |
| `--surface-sunken` | `#0a0a0e` | `#f4f3f0` |
| `--surface-raised` | `#121219` | `#ffffff` |
| `--line` | `rgba(255,255,255,0.1)` | `rgba(8,8,10,0.12)` |
| `--line-strong` | `rgba(255,255,255,0.18)` | `rgba(8,8,10,0.2)` |

### 2.2 Teks

| Token | Gelap | Terang |
|---|---|---|
| `--text` | `#ffffff` | `#08080a` |
| `--text-muted` | `rgba(255,255,255,0.74)` | `#4a4a55` |
| `--text-subtle` | `rgba(255,255,255,0.58)` | `#63636e` |
| `--text-inverse` | `#08080a` | `#ffffff` |

### 2.3 Brand & aksi

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--brand` | `#eb1487` | Pink brand. Bidang, bukan tombol berteks putih. |
| `--brand-deep` / `--cta` | `#d81280` | **Tombol utama.** |
| `--brand-press` / `--cta-hover` | `#cf0f79` | Tombol ditekan. Di tema terang jadi warna aksen teks. |
| `--brand-acid` | `#d8ff36` | Aksen bidang. Tidak pernah membawa teks. |
| `--brand-cyan` / `--accent` | `#66d7e8` | Elemen interaktif di tema gelap (kontras 11,86 di atas ink). |
| `--accent-strong` | `#8fe5f2` (gelap) · `#b00c68` (terang) | Hover aksen. |
| `--accent-soft` | `rgba(102,215,232,0.14)` · `#fdeaf4` | Latar chip aktif. |

**Tiga keputusan yang tidak boleh dibalik saat prototyping:**

1. Tombol utama memakai **pink-deep `#d81280`**, bukan `#eb1487`. Teks putih di atas `#eb1487` hanya mencapai kontras 4,21 dan gagal AA; di atas `#d81280` mencapai 4,86.
2. Di tema terang, **cyan dan acid tidak pernah membawa teks** — kontrasnya 1,48 dan 1,01 di atas paper, praktis tidak terlihat. Keduanya hanya jadi bidang. Aksen teks pindah ke pink-press `#cf0f79` (4,61).
3. Gelap adalah tema bawaan token, tapi **HTML dimuat dengan `data-theme="light"`**. Terang bukan pembalikan warna: kontras, bayangan, dan kekuatan aksennya ditulis ulang supaya keduanya terasa disengaja.

### 2.4 Status

| Token | Gelap | Terang |
|---|---|---|
| `--positive` | `#5fd3a0` | `#0d7a52` |
| `--warning` | `#e8b45e` | `#8a5a00` |
| `--danger` | `#f0857c` | `#b3261e` |

Setiap status punya varian `-soft` untuk latar badge (13% opacity di gelap, hex pucat di terang).

### 2.5 Aksen platform

| Token | Gelap | Terang |
|---|---|---|
| `--platform-tiktok` | `#1fd8d1` | `#0a8f88` |
| `--platform-shopee` | `#f2652f` | `#ee4d2d` |
| `--platform-shopee-solid` | `#c2410c` (sama di kedua tema) | — |

Dipakai **hanya sebagai garis tepi tipis di kartu katalog**, bukan isian. Alasannya: pink dan cyan brand asli TikTok nyaris sama dengan `--cta` dan `--accent` milik situs sendiri, jadi kartu TikTok akan terbaca seperti kartu berstatus "aktif/hover" alih-alih penanda platform. `--platform-shopee-solid` khusus untuk isian solid yang membawa teks putih (≥4,5:1).

### 2.6 Tipografi

| Peran | Font |
|---|---|
| Display | `Archivo`, fallback SF Pro Display, system-ui |
| Body | `-apple-system`, SF Pro Text, `Inter`, system-ui |

Di iOS dan macOS, body memakai SF Pro dan Inter tidak pernah diunduh sama sekali.

| Token | Nilai |
|---|---|
| `--text-display` | `clamp(40px, 6vw, 76px)` |
| `--text-h1` | `clamp(32px, 4.2vw, 52px)` |
| `--text-h2` | `clamp(25px, 2.6vw, 34px)` |
| `--text-h3` | `clamp(19px, 1.5vw, 22px)` |
| `--text-lead` | `18px` |
| `--text-body` | `16px` |
| `--text-sm` | `14px` |
| `--text-xs` | `12px` |

Empat bobot saja: `400` regular, `550` medium, `650` semibold, `750` display. Selisih 50 tidak terbaca oleh mata, jadi tidak ada tingkat lain.

Tracking: display `-0.035em`, tight `-0.018em`, wide `0.06em` (khusus eyebrow uppercase).

### 2.7 Spasi, radius, bayangan, gerak

**Spasi:** 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 · 96 · 128 px. Dua langkah setengah (2px, 6px) ada khusus untuk padding badge dan chip, yang terlihat terlalu tinggi bila dipaksa ke kelipatan 4. Jarak antar section: `clamp(56px, 4vw + 40px, 112px)`.

**Radius:** `sm 8px` · `md 12px` · `lg 16px` · `xl 20px` · `2xl 24px` · `pill 999px`. Pil hanya untuk badge dan kontrol ringkas.

**Bayangan:**

| Token | Gelap |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.5)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.55)` — modal & sheet |
| `--shadow-lg` | `0 20px 52px rgba(0,0,0,0.7)` |
| `--shadow-card` | `0 2px 10px rgba(0,0,0,0.32)` — khusus hover kartu deal yang cuma naik 2px |

**Gerak:** durasi `150ms` / `250ms` / `350ms`. Easing keluar `cubic-bezier(0.16, 1, 0.3, 1)`, easing dua arah `cubic-bezier(0.4, 0, 0.2, 1)`.

### 2.8 Layout

`--shell-width: 1180px` · `--header-height: 64px`.

Breakpoint yang diuji: **320 · 375 · 768 · 1024 · 1440**. Grid katalog memakai dua kartu ringkas per baris di mobile untuk discovery cepat; mode list tetap satu baris penuh untuk pembacaan detail.

---

### 2.9 Prompt Design System

> Buat design system untuk aplikasi web mobile-first bernama **TAP by Haluan**, sebuah platform affiliate untuk content creator Indonesia. Gaya visualnya premium, padat, dan editorial — bukan template SaaS generik.
>
> **Warna (tema terang, ini yang utama):** latar putih `#ffffff`, permukaan cekung `#f4f3f0`, garis `rgba(8,8,10,0.12)`. Teks utama `#08080a`, teks sekunder `#4a4a55`, teks tersier `#63636e`. Tombol utama **pink `#d81280`** dengan teks putih, hover `#b00c68`. Warna aksen dan link `#cf0f79`. Latar chip aktif `#fdeaf4`. Status: hijau `#0d7a52`, kuning `#8a5a00`, merah `#b3261e`.
>
> **Warna (tema gelap):** latar `#08080a`, permukaan `#0c0c11`, permukaan terangkat `#121219`, garis `rgba(255,255,255,0.1)`. Teks putih penuh untuk judul, `rgba(255,255,255,0.74)` untuk isi. Aksen interaktif cyan `#66d7e8`. Tombol utama tetap pink `#d81280`.
>
> **Aksen platform** dipakai hanya sebagai garis tepi tipis di kartu: TikTok teal `#1fd8d1`, Shopee oranye `#f2652f`. Jangan dipakai sebagai isian penuh.
>
> **Tipografi:** judul memakai **Archivo** dengan bobot 750 dan letter-spacing rapat `-0.035em`. Teks isi memakai font sistem (SF Pro / Inter) bobot 400–650. Skala: display 40–76px, h1 32–52px, h2 25–34px, h3 19–22px, lead 18px, body 16px, small 14px, extra small 12px. Label eyebrow ditulis huruf kecil dengan letter-spacing longgar `0.06em`.
>
> **Radius:** 8px untuk elemen kecil, 12px untuk field, 16px untuk kartu, 20–24px untuk panel besar, dan pil penuh khusus badge dan chip filter.
>
> **Spasi:** kelipatan 4px (4, 8, 12, 16, 24, 32, 48, 64), dengan jarak antar section 56–112px.
>
> **Bayangan:** sangat halus. Kartu memakai `0 2px 10px rgba(8,8,10,0.05)`, modal memakai `0 4px 14px rgba(8,8,10,0.08)`.
>
> Lebar konten maksimum 1180px, tinggi header 64px. Semua interaksi punya state hover, focus, dan active yang terlihat jelas.

---

## 3. Inventaris komponen

Komponen berikut muncul di banyak layar. Prompt per layar merujuk ke sini supaya tidak perlu mengulang deskripsinya.

### 3.1 SiteHeader
[app/components/SiteHeader.tsx](app/components/SiteHeader.tsx)

Sticky di atas dengan latar buram. **Garis bawahnya baru muncul setelah halaman digulir**, supaya di posisi awal header menyatu dengan hero.

Kiri: logo Haluan Digital Network (bitmap 92×24) + divider vertikal tipis + wordmark `TAP` tebal.
Tengah: nav teks. Varian home — `Semua deal` · `Cara kerja` · `Request sample` · `Daftar`. Varian subpage — `Home` · `Request sample` · `Daftar`.
Kanan: link sesi (`Masuk creator ↗` atau `<Nama depan> · Dashboard ↗`) + tombol pink `Gabung sekarang`. Kalau sudah login, tombol dan link `Daftar` hilang.

### 3.2 MobileNav
[app/MobileNav.tsx](app/MobileNav.tsx)

Tab bar bawah, 3 item: **Deal** (◈) · **Sample** (＋) · **Akun** (◯). Tidak muncul di halaman admin.

### 3.3 BrandCard — dua varian
[app/components/BrandCard.tsx](app/components/BrandCard.tsx)

Struktur bersama: header (logo brand persegi 48px + nama brand + baris kategori "`Kategori` · `N` campaign") → badan → baris badge → footer CTA.

**Varian TikTok:** badan diisi angka komisi besar (mis. `12%`) dengan label kecil di bawahnya: `Komisi creator · mulai dari` bila brand punya lebih dari satu campaign, atau `Komisi creator` bila hanya satu. Kalau komisi tidak terbaca, angkanya diredupkan dan labelnya berbunyi `Komisi belum terbaca dari sheet`. CTA: `Dapatkan komisi ↗`.

**Varian Shopee:** badan diisi daftar benefit bercentang — `✓ Komisi Special`, `✓ Sample tersedia`, `✓ Harga live khusus`. Kalau kosong: `Belum ada benefit yang dikonfirmasi brand.` CTA: `Lihat campaign ↗`.

**Kartu berakhir:** seluruh kartu diredupkan, logo dibuat abu-abu, CTA berubah jadi teks non-aktif `Campaign sudah berakhir`.

Badge `New SKU` menempel pada baris kategori, bukan baris badge bawah — karena SKU baru adalah keterangan tentang brandnya, bukan status campaign.

### 3.4 CampaignSheet
[app/components/CampaignSheet.tsx](app/components/CampaignSheet.tsx)

Modal/bottom sheet yang terbuka saat kartu diklik. Header: logo 52px + nama brand + baris `Kategori · Platform` + tombol tutup ✕. Badan: petak metrik (Komisi creator, Sample, Berlaku hingga) lalu section `Link affiliate`. Footer: tombol `Bagikan halaman brand` dan (kalau ada sample) `Request sample ↗`.

Hanya satu link yang ditawarkan — tier dengan komisi terkecil — jadi creator tidak perlu memilih apa pun. Linknya ditampilkan apa adanya supaya bisa disalin, bukan disembunyikan di balik tombol.

### 3.5 AffiliateLinkField
[app/components/AffiliateLinkField.tsx](app/components/AffiliateLinkField.tsx)

Field baca-saja berisi URL penuh + tombol salin + tombol buka. Saat link belum dimuat, tempatnya diisi skeleton setinggi 44px, bukan spinner.

### 3.6 Badge & chip
Aturannya di [lib/campaign-flags.ts](lib/campaign-flags.ts) dan [lib/hot-deals-config.ts](lib/hot-deals-config.ts).

| Badge | Bentuk | Kapan muncul |
|---|---|---|
| `✓ Sample tersedia` | pil, positive-soft | Campaign punya sample dan belum berakhir |
| `New SKU` | pil kecil, aksen | Ditandai admin lewat CMS |
| `Berakhir hari ini` / `Berakhir besok` / `Berakhir N hari lagi` | pil, warning-soft | Sisa ≤ 14 hari |
| `Sudah berakhir` | pil, danger-soft | Tanggal sudah lewat |
| `Tanggal perlu verifikasi` | pil, danger-soft | Tanggal di sumber tidak terbaca |
| `Brand pilihan` · `Trending` · `Tinggi konversi` · `Banyak peminat` | pil, aksen | Hot Deals — satu badge per campaign, tidak pernah ditumpuk |

**Chip filter:** pil dengan garis tepi. Saat aktif (`aria-pressed="true"`) latarnya jadi accent-soft dan garis tepinya menguat. Punya `chip-count` — angka kecil di dalam pil, warnanya lebih redup.

### 3.7 activation-card
[app/dashboard/page.tsx](app/dashboard/page.tsx)

Kartu horizontal lebar. Kiri: angka persentase kelengkapan profil berukuran sangat besar dengan `%` kecil di sampingnya. Tengah: label status membership huruf kapital, judul, dan satu baris keterangan berisi daftar field yang masih kurang. Kanan: link aksi (`Lengkapi sekarang →` atau `Perbarui profil →`). Kalau membership sudah `VERIFIED`, kartunya memakai varian hijau.

### 3.8 admin-stats · metric-line · admin-table
[app/admin/(dashboard)/analitik/page.tsx](app/admin/(dashboard)/analitik/page.tsx)

**admin-stats:** baris kartu KPI. Tiap kartu: label kecil huruf kapital, angka besar, opsional keterangan kecil di bawah.

**metric-line:** baris `nama — bar horizontal — angka`. Bar-nya proporsional terhadap nilai terbesar di daftar itu, bukan terhadap 100.

**admin-table:** tabel penuh dengan header tebal, baris bergaris tipis, kolom angka rata kanan, kolom aksi paling kanan. Selalu punya baris kosong berisi kalimat spesifik (mis. `Belum ada campaign yang cocok dengan filter ini.`). Di bawahnya paginasi: `← Sebelumnya` · `Halaman 1 dari 12 · 580 brand` · `Berikutnya →`.

**admin-filterbar:** satu baris berisi field pencarian berikon `⌕`, satu atau dua dropdown, dan tombol `Terapkan`.

### 3.9 Empty state
Dua pola:

**state-panel** (publik) — panel bergaris putus-putus berisi judul, satu kalimat penjelasan, dan satu tombol sekunder. Contoh: `Belum ada deal yang cocok` / `Coba ubah kata pencarian atau lepas sebagian filter kamu.` / `Reset filter`.

**dashboard-empty** (creator) — blok tengah berisi kalimat tebal, satu kalimat penjelasan, dan satu link. Contoh: `Belum ada campaign tersimpan.` / `Simpan campaign yang kamu suka dari halaman deal untuk melihatnya di sini.` / `Jelajahi semua deal ↗`.

### 3.10 Pola form
[app/styles/forms.css](app/styles/forms.css)

Label di atas field, ukuran 14px. Field tinggi ~44px, radius 12px, garis tepi tipis, fokus menampilkan ring aksen. Baris dua kolom memakai kelas `two-col`. Checkbox konsen ditulis dalam satu baris dengan link ke Ketentuan dan Kebijakan Privasi. Tombol submit lebar penuh, pink, dengan panah `↗` di ujung dan label berubah jadi `Menyimpan…` saat pending.

---

## 4. Peta layar & alur

### 4.1 Discovery (tanpa login)

```
/                     Beranda
  ├─ Hot Deals ────────────────┐
  ├─ SKU Baru ─────────────────┤
  ├─ Katalog TikTok (12) ──────┤
  └─ Katalog Shopee (12) ──────┤
                               ▼
/deals?platform=tiktok|shopee  Katalog penuh
  └─ klik kartu ──▶ CampaignSheet (modal, link affiliate)
                     └─ "Bagikan halaman brand" ──▶ /deal/[slug]
                                                     ├─ salin link
                                                     ├─ /go/[slug] ──▶ etalase platform
                                                     ├─ "Simpan" (butuh login)
                                                     └─ "Request sample ↗" ──▶ /request-sample
```

Klik pada `/go/[slug]` dicatat sebagai `LinkClick` di server sebelum diarahkan ke platform.

### 4.2 Aktivasi creator

```
/daftar                    Satu kartu, lima mode:
  register ──▶ verify ──┐  daftar · masuk · verifikasi · lupa sandi · reset sandi
  login ────▶ verify ───┤
  forgot ───▶ reset ────┘
                    ▼
/daftar/lengkapi           Onboarding wajib: nama, WhatsApp, kategori konten, konsen
                    ▼
/dashboard                 Terbuka setelah onboardingCompletedAt terisi
                    ▼
/dashboard/profil          4 tab, masing-masing disimpan terpisah
```

Kelengkapan profil dihitung dari **9 field wajib** ([lib/profile-completeness.ts](lib/profile-completeness.ts)): Nama lengkap, Nomor WhatsApp, Provinsi, Kabupaten/Kota, Kecamatan, Kelurahan/Desa, Alamat lengkap, Kode pos, Nomor penerima paket.

### 4.3 Sample

```
/request-sample            Enam kondisi tampilan:
  1. skeleton (sedang memuat)
  2. gagal muat daftar campaign
  3. belum login
  4. membership belum VERIFIED (pending / rejected)
  5. tidak ada campaign yang membuka sample
  6. form penuh
                    ▼ kirim
/admin/sample              Antrean admin, default filter PENDING
  └─ /admin/sample/[id] ──▶ aksi: setujui · tolak · kirim (kurir+resi) · selesaikan
                    ▼
/dashboard/sample          Stepper: Diajukan → Disetujui → Dikirim → Selesai
                           Cabang terpisah: Ditolak · Dibatalkan
```

**Penting:** `REJECTED` dan `CANCELLED` bukan titik di garis stepper. Keduanya dirender sebagai catatan tersendiri, bukan stepper yang terlihat "sampai langkah tertentu lalu berhenti".

### 4.4 Shell navigasi

| Permukaan | Navigasi |
|---|---|
| Publik | SiteHeader atas + MobileNav bawah (3 tab) |
| Creator | Topbar (logo, nama, status membership, avatar inisial, Keluar) + sidebar kiri 7 item + kartu bantuan di bawah sidebar |
| Admin | Sidebar kiri (logo, 9 item, opsional 3 item super admin, kartu "Protected workspace") + header atas berisi `HALUAN AFFILIATE OPERATIONS`, link `← Dashboard creator`, nama, peran, avatar, Keluar |

---

## 5. Katalog layar & prompt

Format tiap layar: tujuan → struktur → data → state → copy verbatim → prompt siap tempel.

---

## 5A. Permukaan publik

### S-01 · Beranda
**Route:** `/` · **Peran:** publik · **File:** [app/page.tsx](app/page.tsx)

**Tujuan** — meyakinkan creator bahwa rate di TAP lebih tinggi daripada open plan, lalu mengarahkan ke katalog penuh.

**Struktur (atas ke bawah):**
1. SiteHeader varian home
2. Hero: eyebrow, judul dua baris, paragraf, dua tombol, visual di kanan
3. Proof bar: 4 angka berjajar (hanya muncul kalau katalog berhasil dimuat)
4. Hot Deals (disembunyikan kalau kosong)
5. SKU Baru (disembunyikan kalau kosong)
6. Katalog TikTok — 12 kartu preview, tanpa kontrol filter
7. Katalog Shopee — 12 kartu preview (hanya kalau ada data Shopee)
8. Cara kerja — 3 langkah bernomor
9. FAQ — 5 item accordion
10. Join banner
11. SiteFooter

**Data yang tampil:**

| Elemen | Nilai | Contoh |
|---|---|---|
| Tombol hero 1 | `Lihat {jumlah brand TikTok} brand ↓` | `Lihat 320 brand ↓` |
| Proof bar | brand dengan deal aktif · campaign TikTok Shop · brand membuka request sample · biaya untuk creator Haluan | `320` · `464` · `87` · `0` |
| Kartu preview | 12 per platform | — |

**State:** kalau katalog gagal dimuat, proof bar dan kartu diganti `state-panel` berisi `Data campaign belum bisa dimuat` / `Coba muat ulang halaman ini sebentar lagi.` / tombol `Muat ulang`.

**Copy verbatim:**

> Eyebrow: `Haluan creator advantage`
> H1: `Rate lebih tinggi.` **`Khusus creator Haluan.`** (bagian kedua miring)
> Paragraf: `Kami negosiasikan extra commission langsung dengan brand. Kamu tinggal pilih deal, buat konten, dan maksimalkan setiap penjualan.`
> Tombol: `Lihat 320 brand ↓` · `Masuk sebagai anggota`
>
> Hot Deals — eyebrow `Paling populer`, H2 `Deal yang paling banyak diambil creator.`, sub `Berdasarkan klik, request sample, dan brand pilihan tim Haluan — bukan angka perkiraan.`
>
> SKU Baru — eyebrow `Baru masuk`, H2 `SKU baru di TikTok Shop dan Shopee.`, sub `Produk yang baru dibuka brand untuk creator Haluan. Rate dan benefit tetap mengikuti ketentuan campaign masing-masing.`
>
> Katalog TikTok — eyebrow `Live opportunity board`, H2 `Extra komisi yang siap kamu ambil.`, sub `Komisi yang ditampilkan adalah komisi terendah dari campaign brand tersebut. Link etalase dapat dilihat dan disalin tanpa login.`, tombol `Lihat semua 320 deal ↗`
>
> Katalog Shopee — eyebrow `Campaign link & benefit Shopee`, H2 `Campaign Shopee yang sedang jalan.`, sub `Sheet ini tidak memuat rate komisi. TAP hanya menampilkan benefit yang tersedia tanpa membuat angka estimasi.`, tombol `Lihat semua 96 campaign ↗`
>
> Cara kerja — eyebrow `Dari scroll ke sales`, H2 `Tiga langkah. Tanpa chat satu-satu.`
> 1. `Gabung MCN Haluan` — `Daftar dan hubungkan akun affiliate kamu dengan network Haluan.`
> 2. `Buka akses campaign` — `Pilih campaign, akses link khusus, dan request sample jika tersedia.`
> 3. `Buat konten & jual` — `Publish konten seperti biasa. Komisi mengikuti ketentuan campaign.`
>
> FAQ — eyebrow `Sebelum mulai`, H2 `Yang perlu kamu tahu.`, lede `Jawaban singkat tentang komisi, akses link, dan request sample di TAP.`
> - `Kenapa komisinya ditulis "mulai dari"?`
> - `Apakah semua creator bisa membuka link deal?`
> - `Apakah bergabung dan memakai TAP berbayar?`
> - `Apakah request sample pasti disetujui?`
> - `Kenapa link harus dibuka melalui TAP?`
>
> Join banner — eyebrow `Creator advantage starts here`, H2 `Sudah bikin konten. Sekarang naikkan rate-nya.`, sub `Gabung bersama creator Haluan dan akses deal yang tidak tersedia di open plan.`, tombol `Gabung sekarang ↗`

> **Prompt Stitch**
>
> Buat halaman beranda untuk **TAP by Haluan**, platform affiliate untuk content creator Indonesia. Tema terang, latar putih, aksen pink `#d81280`, judul memakai font Archivo tebal dengan letter-spacing rapat.
>
> **Header sticky:** logo teks "TAP" di kiri dengan garis pemisah vertikal, nav tengah berisi "Semua deal", "Cara kerja", "Request sample", "Daftar", dan di kanan link "Masuk creator ↗" plus tombol pink "Gabung sekarang".
>
> **Hero:** label kecil huruf kecil ber-spasi longgar "Haluan creator advantage". Judul sangat besar dua baris: "Rate lebih tinggi." lalu "Khusus creator Haluan." dengan baris kedua ditulis miring dan berwarna pink. Paragraf: "Kami negosiasikan extra commission langsung dengan brand. Kamu tinggal pilih deal, buat konten, dan maksimalkan setiap penjualan." Dua tombol berdampingan: tombol pink "Lihat 320 brand ↓" dan tombol putih bergaris "Masuk sebagai anggota". Di sisi kanan hero ada visual abstrak berisi tiga angka bertumpuk: 320 brand TikTok, 464 campaign, 96 brand Shopee.
>
> **Baris bukti:** empat angka besar berjajar dengan label kecil di atasnya — "brand dengan deal aktif 320", "campaign TikTok Shop 464", "brand membuka request sample 87", "biaya untuk creator Haluan 0".
>
> **Section katalog:** label "Live opportunity board", judul "Extra komisi yang siap kamu ambil.", satu paragraf penjelasan, dan tombol putih "Lihat semua 320 deal ↗" di kanan. Di bawahnya grid 12 kartu brand. Setiap kartu: logo brand persegi 48px di kiri atas, nama brand tebal, baris kecil "Beauty & Health · 3 campaign", lalu angka persentase komisi sangat besar seperti "12%" dengan label kecil "Komisi creator · mulai dari" di bawahnya, badge pil hijau "✓ Sample tersedia", dan tombol teks "Dapatkan komisi ↗" di bagian bawah kartu. Kartu punya garis tepi tipis teal `#1fd8d1`.
>
> **Section Shopee:** struktur sama, judul "Campaign Shopee yang sedang jalan.", tapi kartunya **tidak menampilkan angka komisi sama sekali**. Sebagai gantinya daftar benefit bercentang: "✓ Komisi Special", "✓ Sample tersedia", "✓ Harga live khusus". Tombolnya "Lihat campaign ↗". Garis tepi kartu oranye `#f2652f`.
>
> **Section cara kerja:** judul "Tiga langkah. Tanpa chat satu-satu." dengan tiga kolom bernomor besar 01, 02, 03.
>
> **FAQ:** lima item accordion dengan tanda plus di kanan.
>
> **Banner penutup:** blok berwarna pekat dengan judul "Sudah bikin konten. Sekarang naikkan rate-nya." dan tombol pink "Gabung sekarang ↗".
>
> **Footer:** tiga kolom (Campaign, Creator, dan blok deskripsi TAP) plus baris hak cipta.

---

### S-02 · Katalog penuh
**Route:** `/deals` dan `/deals?platform=shopee` · **Peran:** publik · **File:** [app/deals/page.tsx](app/deals/page.tsx) + [app/components/CampaignCatalog.tsx](app/components/CampaignCatalog.tsx)

**Tujuan** — mencari dan menyaring seluruh brand yang membuka deal.

**Struktur:**
1. SiteHeader varian subpage
2. Subpage hero: eyebrow, H1, sub, catatan platform
3. Tab platform (2 chip besar dengan hitungan)
4. Field pencarian dominan dengan ikon `⌕` dan petunjuk `⌘ K`
5. Baris chip kategori (scroll horizontal)
6. Kontrol urutan (dropdown)
7. Baris chip komisi + chip sample
8. Baris hasil: `**320** brand ditemukan`
9. Grid kartu (24 per halaman)
10. Tombol `Muat 24 deal lagi`
11. SiteFooter

**Data & kontrol:**

| Kontrol | Isi |
|---|---|
| Tab platform | `TikTok Shop` `320 deal live` · `Shopee Affiliate` `96 campaign live` |
| Kategori | `Semua` + kategori dengan hitungan, diurutkan dari terbanyak. Nilai nyata: Beauty & Health, Fashion, Food & FMCG, Home & Living, Tech, Mom & Baby, Lainnya |
| Band komisi | `Di bawah 5%` · `5–10%` · `10–15%` · `15% ke atas` — **disembunyikan di tab Shopee** |
| Sample | `✓ Sample tersedia` dengan hitungan — hanya muncul kalau memang ada |
| Urutkan | `Rekomendasi` · `Komisi tertinggi` · `Komisi terendah` · `Nama brand` — dua opsi komisi **disembunyikan di tab Shopee** |

**Aturan urutan:** campaign yang sudah berakhir selalu turun ke paling bawah, apa pun pilihan sortirnya.

**State:**
- Ada hasil → grid kartu
- Filter tidak menghasilkan apa-apa → `state-panel`: `Belum ada deal yang cocok` / `Coba ubah kata pencarian atau lepas sebagian filter kamu.` / tombol `Reset filter`
- Katalog gagal dimuat → `state-panel`: `Data campaign belum bisa dimuat` / `Coba muat ulang halaman ini sebentar lagi.` / tombol `Coba lagi`
- Ada teks di field pencarian → ikon `⌘K` berganti jadi tombol silang `✕`

**Copy verbatim:**

> Eyebrow `Live opportunity board` · H1 `Semua deal. Satu tempat.`
> Sub: `Temukan extra commission TikTok dan campaign affiliate Shopee khusus creator Haluan.`
> Catatan platform (TikTok): `Komisi yang ditampilkan adalah komisi terendah dari seluruh campaign brand tersebut.`
> Catatan platform (Shopee): `Campaign link & benefit Shopee. Sheet ini tidak memuat rate komisi. TAP hanya menampilkan benefit yang tersedia tanpa membuat angka estimasi.`
> Placeholder pencarian: `Cari brand atau campaign…`
> Label urutan: `Urutkan`
> Baris hasil: `320 brand ditemukan` (bertambah ` dari filter yang kamu pilih` saat ada filter aktif)
> Tombol muat: `Muat 24 deal lagi`

> **Prompt Stitch**
>
> Buat halaman katalog penuh bernama "Semua deal" untuk platform affiliate **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo.
>
> **Bagian atas:** header sticky ringkas dengan logo "TAP", nav "Home · Request sample · Daftar", dan tombol pink "Gabung sekarang". Di bawahnya label kecil "Live opportunity board", judul besar "Semua deal. Satu tempat.", paragraf "Temukan extra commission TikTok dan campaign affiliate Shopee khusus creator Haluan.", lalu satu baris catatan abu-abu "Komisi yang ditampilkan adalah komisi terendah dari seluruh campaign brand tersebut."
>
> **Tab platform:** dua chip pil besar berdampingan. "TikTok Shop" dengan hitungan kecil "320 deal live" di dalamnya (aktif, latar pink pucat, garis tepi pink), dan "Shopee Affiliate" dengan "96 campaign live" (tidak aktif, garis tepi abu).
>
> **Pencarian:** field lebar penuh setinggi 52px dengan ikon kaca pembesar di kiri, placeholder "Cari brand atau campaign…", dan di kanan dua kotak tombol keyboard kecil bertuliskan ⌘ dan K.
>
> **Baris filter 1 — kategori:** chip pil yang bisa di-scroll horizontal. "Semua 320" (aktif), "Beauty & Health 96", "Fashion 61", "Food & FMCG 48", "Home & Living 42", "Tech 37", "Mom & Baby 24", "Lainnya 12". Setiap chip menampilkan angka hitungan dengan warna lebih redup di sebelah namanya.
>
> **Baris filter 2 — urutan:** label "Urutkan" diikuti dropdown berisi "Rekomendasi".
>
> **Baris filter 3 — komisi & sample:** chip "Di bawah 5%", "5–10%", "10–15%", "15% ke atas", lalu chip "✓ Sample tersedia 87".
>
> **Baris hasil:** teks "**320** brand ditemukan" dengan angkanya tebal.
>
> **Grid kartu:** dua kolom di mobile, empat kolom di desktop. Setiap kartu punya logo brand persegi 48px, nama brand tebal, baris kecil kategori dan jumlah campaign, angka persen komisi sangat besar dengan label "Komisi creator · mulai dari", badge pil hijau "✓ Sample tersedia", dan tombol teks "Dapatkan komisi ↗" di bawah. Garis tepi tipis teal. Satu kartu dibuat dalam kondisi berakhir: seluruhnya diredupkan, logo abu-abu, dan tombolnya berubah jadi teks non-aktif "Campaign sudah berakhir" dengan badge merah pucat "Sudah berakhir".
>
> **Bagian bawah:** tombol putih bergaris lebar "Muat 24 deal lagi", lalu footer.
>
> Sertakan juga tampilan alternatif tanpa hasil: panel bergaris putus-putus di tengah berisi judul "Belum ada deal yang cocok", kalimat "Coba ubah kata pencarian atau lepas sebagian filter kamu.", dan tombol "Reset filter".

---

### S-03 · Campaign sheet (modal)
**Route:** overlay di `/` dan `/deals` · **Peran:** publik · **File:** [app/components/CampaignSheet.tsx](app/components/CampaignSheet.tsx)

**Tujuan** — memberi link affiliate dalam satu langkah, tanpa memaksa creator memilih tier.

**Struktur:** backdrop gelap + panel. Header (logo 52px, nama brand, `Kategori · Platform`, tombol ✕) → petak metrik → section `Link affiliate` → footer dua tombol.

**Petak metrik:** `Komisi creator` (disembunyikan untuk Shopee) · `Sample` (`Tersedia` / `Belum tersedia`) · `Berlaku hingga` (lebar penuh, dengan catatan kecil di bawah nilainya seperti `Berakhir 5 hari lagi`).

**State:**
- Memuat → baris skeleton setinggi 44px di tempat field link
- Gagal → `Link affiliate belum bisa dimuat. Coba tutup dan buka lagi sebentar.`
- Berhasil → field link + tombol salin + tombol buka

**Copy verbatim:** section `Link affiliate` · tombol footer `Bagikan halaman brand` dan `Request sample ↗` · label tutup `Tutup detail campaign`.

> **Prompt Stitch**
>
> Buat modal bottom sheet untuk detail campaign brand di aplikasi affiliate **TAP by Haluan**. Latar belakang halaman diredupkan dengan overlay gelap semi-transparan. Panel putih naik dari bawah dengan sudut atas membulat 24px dan bayangan halus.
>
> **Header panel:** logo brand persegi 52px di kiri, di sebelahnya nama brand berukuran besar tebal dan baris kecil abu-abu "Beauty & Health · TikTok Shop", lalu tombol tutup ✕ bulat di kanan atas.
>
> **Petak metrik:** dua kotak berdampingan lalu satu kotak lebar penuh. Kotak 1 berlabel kecil "Komisi creator" dengan nilai besar "12%". Kotak 2 berlabel "Sample" dengan nilai "Tersedia". Kotak lebar berlabel "Berlaku hingga" dengan nilai "31/12/2026" dan catatan kecil pink di bawahnya "Berakhir 5 hari lagi".
>
> **Section link:** judul kecil "Link affiliate", lalu field baca-saja lebar penuh setinggi 44px berisi URL panjang yang terpotong, dengan dua tombol ikon di ujung kanan — ikon salin dan ikon buka di tab baru.
>
> **Footer panel:** dua tombol bertumpuk lebar penuh — tombol putih bergaris "Bagikan halaman brand" dan tombol transparan "Request sample ↗".
>
> Tema terang, aksen pink `#d81280`, radius 16px untuk kotak metrik, font judul Archivo.

---

### S-04 · Detail deal
**Route:** `/deal/[slug]` · **Peran:** publik · **File:** [app/deal/[campaignId]/page.tsx](app/deal/[campaignId]/page.tsx)

**Tujuan** — halaman brand yang bisa dibagikan, berisi link affiliate dan jalur ke request sample.

**Struktur:**
1. SiteHeader subpage
2. Tombol kembali `← Semua deal`
3. Header: logo brand 64px + eyebrow `TikTok campaign` + H1 nama brand + baris `Kategori · Platform`
4. Petak metrik (4 kotak)
5. Catatan multi-campaign (hanya kalau brand punya >1 campaign)
6. Section `Link affiliate`
7. Panel sample (hanya kalau ada sample)
8. Baris tombol: bagikan + simpan
9. Catatan kaki
10. SiteFooter

**Petak metrik:** `Komisi creator` (nilai besar) · `Status campaign` (`Masih berjalan` / `Sudah berakhir`) · `Sample` lebar penuh (`Sample tersedia` / `Belum tersedia`) · `Berlaku hingga` lebar penuh.

**Copy verbatim:**

> Section link — H2 `Link affiliate`, sub `Salin linknya atau buka langsung etalasenya. Link ini dapat diakses tanpa login.`
> Catatan multi-campaign: `Brand ini punya beberapa campaign dengan komisi berbeda. Yang dibagikan di sini adalah campaign dengan komisi terendah, sama dengan angka di atas.`
> Panel sample — H2 `Perlu produk untuk membuat konten?`, sub `Login untuk mengajukan sample dan memantau statusnya.`, tombol `Request sample ↗`
> Catatan kaki: `Ketersediaan link dan benefit dapat berubah mengikuti periode campaign di platform.`

> **Prompt Stitch**
>
> Buat halaman detail brand untuk platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, lebar konten maksimum 1180px.
>
> Di atas ada tombol teks "← Semua deal". Di bawahnya baris header: logo brand persegi 64px di kiri, lalu label kecil "TikTok campaign", judul besar nama brand "MS Glow", dan baris kecil abu-abu "Beauty & Health · TikTok Shop".
>
> **Petak metrik** dengan lebar maksimum 520px: dua kotak berdampingan lalu dua kotak lebar penuh. "Komisi creator — 12%" dengan angka sangat besar. "Status campaign — Masih berjalan". "Sample — Sample tersedia". "Berlaku hingga — 31/12/2026" dengan catatan kecil pink "Berakhir 5 hari lagi".
>
> Di bawah petak ada satu paragraf abu-abu kecil: "Brand ini punya beberapa campaign dengan komisi berbeda. Yang dibagikan di sini adalah campaign dengan komisi terendah, sama dengan angka di atas."
>
> **Section link affiliate:** judul "Link affiliate", paragraf kecil "Salin linknya atau buka langsung etalasenya. Link ini dapat diakses tanpa login.", lalu field baca-saja berisi URL dengan tombol salin dan tombol buka.
>
> **Panel sample:** kotak dengan latar sedikit berbeda dan garis tepi tipis, judul "Perlu produk untuk membuat konten?", kalimat "Login untuk mengajukan sample dan memantau statusnya.", dan tombol pink "Request sample ↗".
>
> **Baris aksi:** dua tombol putih bergaris berdampingan — "Bagikan" dengan ikon share, dan "Simpan" dengan ikon bintang.
>
> Paling bawah, teks abu-abu sangat kecil: "Ketersediaan link dan benefit dapat berubah mengikuti periode campaign di platform."

---

### S-05 · Request sample
**Route:** `/request-sample` · **Peran:** publik + creator · **File:** [app/request-sample/page.tsx](app/request-sample/page.tsx)

**Tujuan** — mengajukan sample produk. Layar ini punya **enam kondisi tampilan** dalam satu layout dua kolom.

**Layout tetap:** nav ringkas atas (logo + `← Kembali ke katalog`), lalu dua kolom. Kolom kiri (`form-intro`) selalu sama; kolom kanan (`form-panel`) berubah sesuai kondisi.

**Kolom kiri — selalu tampil:**

> Eyebrow dengan titik hidup: `Product sample`
> H1 dua baris: `Coba produknya.` / `Bikin kontennya.` (baris kedua miring)
> Paragraf: `Request sample dari campaign pilihan. Khusus creator Haluan yang sudah terverifikasi dan siap membuat konten sesuai brief.`
> Tiga langkah bernomor:
> `01` `Pilih campaign` — `Hanya brand dengan sample aktif yang tampil.`
> `02` `Review Haluan` — `Profil, brief, dan kuota akan diperiksa.`
> `03` `Pantau pengiriman` — `Status selalu tersedia di dashboard.`

**Enam kondisi kolom kanan:**

| # | Kondisi | Isi |
|---|---|---|
| 1 | Memuat | Skeleton berbentuk form: kicker `Menyiapkan formulir`, kalimat `Kami mencocokkan akunmu dengan master MCN dan mengambil daftar campaign yang masih membuka sample.`, lalu baris-baris abu berbentuk label dan field |
| 2 | Gagal muat | Ikon `↻`, kicker `Koneksi terputus`, H2 `Daftar campaign belum bisa dimuat.`, paragraf `Formulirnya baik-baik saja. Yang gagal adalah pengambilan daftar campaign dengan sample aktif. Biasanya ini sementara.`, tombol `Coba muat ulang ↻`, link `Lihat katalog dulu` |
| 3 | Belum login | Ikon `↗`, kicker `Creator access`, H2 `Masuk sebelum mengisi request.`, paragraf `Data profil dan alamatmu dapat dipakai kembali, jadi kamu tidak perlu mengulang formulir setiap kali meminta sample.`, tombol `Masuk creator ↗`, link `Belum punya akun? Daftar gratis` |
| 4 | Membership belum verified | Ikon `○`, kicker `Verifikasi membership`, H2 `Verifikasi MCN sedang diproses.` (atau `Profilmu perlu diperbaiki.` kalau ditolak), tombol `Buka dashboard ↗`, link `Lihat katalog sementara` |
| 5 | Tidak ada sample | Ikon `◇`, kicker `Belum ada sample`, H2 `Tidak ada campaign yang membuka sample saat ini.`, paragraf `Daftar ini berubah ketika brand membuka kuota baru. Katalog deal tetap bisa kamu pakai sekarang, dan halaman ini akan terisi begitu ada sample aktif.`, tombol `Lihat katalog deal ↗`, link `Kembali ke dashboard` |
| 6 | Form penuh | Lihat di bawah |
| 7 | Sukses | Ikon `✓`, H2 `Request tersimpan.`, paragraf `ID request kamu **{id}**. Tim Haluan akan memprosesnya melalui status review, approval, dan pengiriman yang dapat dipantau di dashboard.`, link `Pantau di dashboard →` |

**Field form (kondisi 6), berurutan:**

1. `Cari campaign dengan sample tersedia` — input dengan datalist, placeholder `Ketik nama brand lalu pilih dari daftar…`. Nilainya berformat `MS Glow · TikTok`. Di bawahnya bisa muncul hint `Memeriksa ketersediaan sample…` atau pesan error gate.
2. Dua kolom: `Nama penerima` · `Nomor WhatsApp` (placeholder `08xxxxxxxxxx`)
3. `Username creator` (placeholder `@username`)
4. `Link profil creator` (placeholder `https://tiktok.com/@username`)
5. `Alamat lengkap (nama jalan, nomor, patokan)` — textarea 2 baris
6. Dua kolom: `RT / RW` (`001/002`) · `Kelurahan / Desa`
7. Dua kolom: `Kecamatan` · `Kabupaten / Kota`
8. Dua kolom: `Provinsi` · `Kode pos` (`12345`)
9. Checkbox: `Saya bersedia membuat konten sesuai brief dan timeline campaign.`
10. Tombol `Kirim request ↗`
11. Catatan: `Request tidak otomatis disetujui. Kecocokan profil dan kuota campaign tetap diverifikasi oleh tim Haluan.`

Header form: label `Request form` di kiri, `± 2 menit` di kanan.

> **Prompt Stitch**
>
> Buat halaman formulir request sample produk untuk platform affiliate creator **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo.
>
> Di paling atas ada nav ringkas: logo "TAP" di kiri, link "← Kembali ke katalog" di kanan.
>
> **Layout dua kolom.** Kolom kiri lebih sempit dan berisi konteks: label kecil dengan titik pink berdenyut "Product sample", judul besar dua baris "Coba produknya." lalu "Bikin kontennya." dengan baris kedua miring dan pink, paragraf penjelasan, dan tiga langkah bernomor besar 01, 02, 03 dengan judul tebal dan satu kalimat masing-masing: "Pilih campaign — Hanya brand dengan sample aktif yang tampil.", "Review Haluan — Profil, brief, dan kuota akan diperiksa.", "Pantau pengiriman — Status selalu tersedia di dashboard."
>
> **Kolom kanan** adalah panel putih dengan garis tepi tipis dan radius 20px, berisi formulir. Di atas formulir ada baris kecil: "Request form" di kiri dan "± 2 menit" di kanan.
>
> Field berurutan: satu field pencarian lebar penuh berlabel "Cari campaign dengan sample tersedia" dengan placeholder "Ketik nama brand lalu pilih dari daftar…". Lalu baris dua kolom "Nama penerima" dan "Nomor WhatsApp". Lalu "Username creator" dan "Link profil creator" masing-masing lebar penuh. Lalu textarea "Alamat lengkap (nama jalan, nomor, patokan)". Lalu tiga baris dua kolom berturut-turut: "RT / RW" dan "Kelurahan / Desa"; "Kecamatan" dan "Kabupaten / Kota"; "Provinsi" dan "Kode pos". Lalu checkbox "Saya bersedia membuat konten sesuai brief dan timeline campaign." Lalu tombol pink lebar penuh "Kirim request ↗". Paling bawah teks abu kecil "Request tidak otomatis disetujui. Kecocokan profil dan kuota campaign tetap diverifikasi oleh tim Haluan."
>
> Label field berukuran 14px di atas fieldnya, field setinggi 44px dengan radius 12px dan garis tepi tipis.

---

### S-06 · Daftar / Masuk
**Route:** `/daftar`, `/daftar?mode=login` · **Peran:** publik · **File:** [app/daftar/AuthClient.tsx](app/daftar/AuthClient.tsx)

**Tujuan** — satu kartu yang menangani lima mode: daftar, masuk, verifikasi kode, lupa sandi, dan reset sandi.

**Layout:** nav ringkas atas (logo + `← Kembali ke home`), lalu dua kolom — konteks di kiri, kartu autentikasi di kanan.

**Kolom kiri:**

> Eyebrow dengan titik hidup: `Creator access`
> H1 dua baris: `Satu akun.` / `Semua deal.` (baris kedua miring)
> Paragraf berubah per mode. Mode daftar: `Daftar untuk request sample, melengkapi profil, dan memantau aktivitas campaign kamu.` Mode masuk: `Masuk untuk melanjutkan request sample dan mengelola profil creator.`
> Tiga poin berjajar: `320 deal terkurasi` · `Extra rate khusus member` · `Gratis untuk creator Haluan`

**Kartu autentikasi (mode daftar & masuk):** tab segmented dua pilihan `Daftar` / `Masuk` di paling atas, lalu:

| Mode | Kicker | Judul | Sub |
|---|---|---|---|
| register | `BUAT AKUN CREATOR` | `Mulai dalam satu menit.` | `Profil creator yang lebih lengkap dapat kamu isi setelah masuk.` |
| login | `SELAMAT DATANG KEMBALI` | `Masuk ke akunmu.` | `Akses deal dan sample yang tersimpan di akunmu.` |
| verify | `VERIFIKASI EMAIL` | `Cek email kamu.` | `Masukkan kode enam digit yang dikirim ke {email}.` |
| forgot | `PULIHKAN AKUN` | `Atur ulang kata sandi.` | `Kami akan mengirim kode reset jika email terdaftar.` |
| reset | `PULIHKAN AKUN` | `Buat kata sandi baru.` | `Masukkan kode yang dikirim ke {email}.` |

**Field per mode:**

| Mode | Field |
|---|---|
| register | `Nama lengkap` · `Nomor WhatsApp` · `Email` · `Kata sandi` (placeholder `Min. 10 karakter + angka`, tombol mata) · checkbox konsen |
| login | `Email` · `Kata sandi` · link `Lupa kata sandi?` |
| verify | `Kode enam digit` (placeholder `000000`) |
| forgot | `Email` |
| reset | `Kode enam digit` · `Kata sandi baru` |

**Tombol submit per mode:** `Buat akun` · `Masuk creator` · `Verifikasi email` · `Kirim kode reset` · `Simpan kata sandi baru`. Semuanya berakhiran `↗` dan berubah jadi `Memproses…` saat pending.

**Google:** tombol `Daftar dengan Google` / `Masuk dengan Google` **disembunyikan** sampai OAuth production aktif. Kalau ditampilkan, posisinya di atas form dengan pemisah bertuliskan `atau lanjut dengan email`. **Untuk prototype awal, jangan gambar tombol ini.**

**Bagian bawah kartu:** baris switch `Sudah punya akun? Masuk` / `Belum punya akun? Daftar`, lalu catatan kecil `Link etalase tersedia untuk publik. Akun diperlukan untuk request sample dan fitur creator.`

> **Prompt Stitch**
>
> Buat halaman daftar dan masuk untuk platform affiliate creator **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo.
>
> Nav ringkas di atas: logo "TAP" di kiri, link "← Kembali ke home" di kanan.
>
> **Layout dua kolom.** Kolom kiri berisi konteks: label kecil dengan titik pink "Creator access", judul sangat besar dua baris "Satu akun." lalu "Semua deal." dengan baris kedua miring dan pink, paragraf "Daftar untuk request sample, melengkapi profil, dan memantau aktivitas campaign kamu.", dan tiga pil kecil berjajar bertuliskan "320 deal terkurasi", "Extra rate khusus member", "Gratis untuk creator Haluan".
>
> **Kolom kanan** adalah kartu putih dengan radius 24px, garis tepi tipis, dan bayangan halus. Di dalamnya:
> - Tab segmented dua pilihan di paling atas: "Daftar" (aktif, latar pink pucat) dan "Masuk".
> - Label kecil huruf kapital ber-spasi longgar "BUAT AKUN CREATOR".
> - Judul "Mulai dalam satu menit."
> - Kalimat abu-abu "Profil creator yang lebih lengkap dapat kamu isi setelah masuk."
> - Field berurutan lebar penuh: "Nama lengkap" (placeholder "Nama lengkap kamu"), "Nomor WhatsApp" (placeholder "08xxxxxxxxxx"), "Email" (placeholder "nama@email.com"), "Kata sandi" (placeholder "Min. 10 karakter + angka") dengan tombol ikon mata di ujung kanan field.
> - Checkbox kecil: "Saya menyetujui Ketentuan dan Kebijakan Privasi TAP." dengan dua kata itu jadi link pink.
> - Tombol pink lebar penuh "Buat akun ↗".
> - Baris teks di bawah: "Sudah punya akun? **Masuk**" dengan kata Masuk sebagai link pink.
> - Teks abu sangat kecil paling bawah: "Link etalase tersedia untuk publik. Akun diperlukan untuk request sample dan fitur creator."
>
> **Jangan tambahkan tombol login Google.**
>
> Buat juga varian kedua kartu yang sama untuk mode verifikasi email: label "VERIFIKASI EMAIL", judul "Cek email kamu.", kalimat "Masukkan kode enam digit yang dikirim ke nama@email.com.", satu field kode enam digit dengan placeholder "000000" dan huruf besar-besar berjarak, tombol "Verifikasi email ↗", dan link "Kembali ke halaman masuk".

---

### S-07 · Onboarding
**Route:** `/daftar/lengkapi` · **Peran:** creator baru · **File:** [app/daftar/lengkapi/OnboardingForm.tsx](app/daftar/lengkapi/OnboardingForm.tsx)

**Tujuan** — satu langkah wajib sebelum dashboard terbuka.

**Field:**
1. `Nama lengkap` (terisi dari pendaftaran)
2. `Nomor WhatsApp` (terisi, placeholder `08xxxxxxxxxx`)
3. Fieldset `Kategori konten (pilih minimal satu)` — daftar checkbox dua kolom
4. Checkbox konsen: `Saya menyetujui Ketentuan dan Kebijakan Privasi TAP.`
5. Tombol `Lanjut ke dashboard ↗` (`Menyimpan…` saat pending)

Kategori yang tersedia: Beauty & Health · Fashion · Food & FMCG · Home & Living · Tech · Mom & Baby · Lainnya.

> **Prompt Stitch**
>
> Buat halaman onboarding satu langkah untuk creator baru di platform **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, panel terpusat dengan lebar maksimum 560px.
>
> Judul besar di atas panel dan satu kalimat pengantar bahwa data ini dipakai untuk mencocokkan campaign yang relevan.
>
> Di dalam panel: field "Nama lengkap" (sudah terisi "Rani Puspita"), field "Nomor WhatsApp" (sudah terisi "081234567890"), lalu satu blok berjudul "Kategori konten (pilih minimal satu)" berisi daftar checkbox dalam dua kolom: Beauty & Health, Fashion, Food & FMCG, Home & Living, Tech, Mom & Baby, Lainnya — dengan dua di antaranya sudah tercentang. Lalu checkbox konsen "Saya menyetujui Ketentuan dan Kebijakan Privasi TAP." dan tombol pink lebar penuh "Lanjut ke dashboard ↗".
>
> Field setinggi 44px dengan radius 12px, label 14px di atas field, checkbox berbentuk kotak membulat 6px dengan centang putih di atas pink saat aktif.

---

## 5B. Creator dashboard

Semua layar di bagian ini memakai shell yang sama (S-14). Prompt tiap layar sudah menyertakan deskripsi shell-nya supaya bisa berdiri sendiri.

### S-14 · Shell dashboard (referensi, ditaruh paling depan)
**File:** [app/dashboard/layout.tsx](app/dashboard/layout.tsx) + [app/dashboard/DashboardNav.tsx](app/dashboard/DashboardNav.tsx)

Bagian ini tidak punya prompt sendiri — deskripsinya sudah disalin ke dalam prompt S-08 sampai S-13 supaya masing-masing bisa dijalankan berdiri sendiri.

**Topbar:** logo Haluan (107×35) + divider + `TAP` di kiri. Di kanan: blok nama (`<Nama>` tebal di atas, label membership kecil di bawah), avatar bulat berisi huruf pertama nama, tombol `Keluar`.

**Label membership:** `MCN terverifikasi` · `Menunggu verifikasi MCN` · `Verifikasi perlu diperbaiki` · `Akun ditangguhkan`.

**Sidebar kiri:** label `WORKSPACE`, lalu 7 item dengan ikon glyph:

| Ikon | Label | Route |
|---|---|---|
| ⌂ | Overview | `/dashboard` |
| ⌁ | Link komisi | `/deals` |
| + | Sample | `/dashboard/sample` |
| ☆ | Tersimpan | `/dashboard/tersimpan` |
| △ | Performa | `/dashboard/performa` |
| ◔ | Notifikasi | `/dashboard/notifikasi` |
| ○ | Profil creator | `/dashboard/profil` |

Item `◆ Admin` muncul tambahan kalau user punya peran admin.

**Kartu bantuan di bawah sidebar:** `Butuh bantuan?` / `Tim Haluan siap membantu proses aktivasi akunmu.` / link `Hubungi tim ↗`.

---

### S-08 · Dashboard overview
**Route:** `/dashboard` · **File:** [app/dashboard/page.tsx](app/dashboard/page.tsx)

**Struktur:**
1. Alert (kondisional)
2. Header sapaan
3. activation-card
4. 4 kartu KPI
5. Section rekomendasi

**Alert kondisional:**
- `membership_pending`: `Request sample belum dapat diajukan.` / `Link etalase tetap dapat dibuka. Lengkapi profil agar tim dapat memverifikasi akunmu untuk request sample.` / link `Lengkapi profil →`
- `forbidden`: `Akses admin tidak tersedia.` / `Akun ini terdaftar sebagai creator.`

**Header sapaan:**

> Eyebrow dengan titik hidup: `Creator dashboard`
> H1: `Halo, **Rani.**` (nama depan saja, miring)
> Paragraf: `Satu tempat untuk membuka extra commission, mengajukan sample, dan memantau aktivitas affiliate kamu.`
> Link kanan: `Lihat deal aktif ↗`

**activation-card:** angka persen besar + label membership huruf kapital + judul (`Akunmu siap untuk request sample.` kalau verified, `Lengkapi profil untuk mempercepat verifikasi.` kalau belum) + baris field yang kurang (`Masih perlu: Kode pos, Nomor penerima paket.`) + link `Lengkapi sekarang →` / `Perbarui profil →`.

**KPI:** `Campaign Aktif` · `Sample Request` · `Sample Approved` · `Saved Campaign`.

**Rekomendasi:** kicker `UNTUK KAMU`, H2 `Deal yang cocok dengan kamu`, link `Lihat semua ↗`. Isinya 4 kartu ringkas: nama brand tebal, baris kecil `Kategori · Platform`, label komisi tebal. Kosong → `Belum ada rekomendasi.` / `Lengkapi kategori kontenmu di profil supaya kami bisa mencocokkan deal yang relevan.`

Skor rekomendasi ([lib/recommendation.ts](lib/recommendation.ts)) memakai: kecocokan kategori, brand yang pernah diklik, ketersediaan sample, komisi kuartil teratas, dan kedekatan tanggal berakhir.

> **Prompt Stitch**
>
> Buat halaman dashboard creator untuk platform affiliate **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo.
>
> **Topbar penuh lebar:** logo "TAP" di kiri. Di kanan, blok nama "Rani Puspita" tebal dengan baris kecil abu di bawahnya "Menunggu verifikasi MCN", lalu avatar bulat pink berisi huruf "R", lalu tombol teks "Keluar".
>
> **Sidebar kiri** selebar 240px: label kecil huruf kapital "WORKSPACE", lalu daftar menu dengan ikon glyph sederhana di kiri tiap label: "Overview" (aktif, latar pink pucat dengan teks pink), "Link komisi", "Sample", "Tersimpan", "Performa", "Notifikasi", "Profil creator". Di bawah menu ada kartu kecil berlatar abu muda: "Butuh bantuan?" tebal, kalimat "Tim Haluan siap membantu proses aktivasi akunmu.", dan link pink "Hubungi tim ↗".
>
> **Konten utama:**
> - Baris sapaan: label kecil dengan titik pink "Creator dashboard", judul besar "Halo, *Rani.*" dengan nama ditulis miring pink, kalimat "Satu tempat untuk membuka extra commission, mengajukan sample, dan memantau aktivitas affiliate kamu." Di kanan baris ini ada link "Lihat deal aktif ↗".
> - **Kartu aktivasi** lebar penuh: di kiri angka "67" sangat besar dengan tanda "%" kecil di sampingnya. Di tengah, label huruf kapital "MENUNGGU VERIFIKASI MCN", judul "Lengkapi profil untuk mempercepat verifikasi.", dan kalimat "Masih perlu: Kode pos, Nomor penerima paket." Di kanan, link "Lengkapi sekarang →".
> - **Empat kartu KPI berjajar:** "Campaign Aktif 416", "Sample Request 3", "Sample Approved 1", "Saved Campaign 8". Label kecil di atas, angka besar di bawah.
> - **Section rekomendasi:** label "UNTUK KAMU", judul "Deal yang cocok dengan kamu", link "Lihat semua ↗" di kanan. Di bawahnya empat kartu ringkas berjajar, tiap kartu berisi nama brand tebal, baris kecil "Beauty & Health · TikTok Shop", dan label komisi tebal "12%".

---

### S-09 · Request sample saya
**Route:** `/dashboard/sample` · **File:** [app/dashboard/sample/page.tsx](app/dashboard/sample/page.tsx)

**Struktur:** judul section (`SAMPLE` / `Request sample kamu` / link `Request sample baru ↗`), lalu daftar kartu request.

**Kartu request:** header (tanggal kecil di atas, nama brand tebal, badge status di kanan) → stepper atau catatan cabang → info pengiriman (kalau sudah dikirim) → tombol batal (kalau masih pending).

**Stepper (jalur normal):** 4 langkah horizontal — `Diajukan` → `Disetujui` → `Dikirim` → `Selesai`. Setiap langkah punya tanggalnya di bawah label. Langkah yang sudah lewat berwarna penuh, langkah aktif ditandai, langkah berikutnya diredupkan.

**Cabang (bukan bagian stepper):**
- Ditolak → blok merah pucat: `Request ini ditolak tim Haluan: {alasan}`
- Dibatalkan → blok abu: `Request ini dibatalkan pada 12/08/2026 14:30.`

**Info pengiriman:** `Kurir: JNE · Resi: JP1234567890`

**Kosong:** `Belum ada request sample.` / `Ajukan sample dari campaign yang membuka kuota untuk mulai membuat konten.` / link `Request sample →`

> **Prompt Stitch**
>
> Buat halaman "Request sample kamu" di dashboard creator platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo. Ada sidebar kiri dengan menu Overview, Link komisi, Sample (aktif), Tersimpan, Performa, Notifikasi, Profil creator.
>
> **Judul section:** label kecil huruf kapital "SAMPLE", judul "Request sample kamu", dan link "Request sample baru ↗" di kanan.
>
> **Daftar kartu request** bertumpuk vertikal. Buat tiga kartu berbeda:
>
> Kartu 1 — header berisi tanggal kecil "20/08/2026 09:12", nama brand tebal "MS Glow", dan badge pil hijau "Dikirim" di kanan. Di bawahnya **stepper horizontal empat langkah**: "Diajukan" dengan tanggal kecil di bawah, "Disetujui" dengan tanggal, "Dikirim" dengan tanggal (langkah aktif, lingkarannya pink penuh), dan "Selesai" (diredupkan, belum ada tanggal). Langkah yang sudah lewat memakai lingkaran pink dengan centang dan garis penghubung pink; langkah yang belum memakai lingkaran kosong abu dan garis abu. Di bawah stepper ada baris kecil "Kurir: JNE · Resi: JP1234567890".
>
> Kartu 2 — brand "Somethinc", badge merah pucat "Ditolak", dan **bukan stepper** melainkan satu blok berlatar merah sangat pucat berisi kalimat "Request ini ditolak tim Haluan: profil belum sesuai kategori campaign."
>
> Kartu 3 — brand "Scarlett Whitening", badge kuning pucat "Diajukan", stepper dengan hanya langkah pertama aktif, dan tombol teks kecil "Batalkan request" di bawahnya.
>
> Setiap kartu memakai latar putih, radius 16px, garis tepi tipis, dan bayangan sangat halus.

---

### S-10 · Campaign tersimpan
**Route:** `/dashboard/tersimpan` · **File:** [app/dashboard/tersimpan/page.tsx](app/dashboard/tersimpan/page.tsx)

**Struktur:** judul section (`TERSIMPAN` / `Campaign yang kamu simpan` / link `Lihat semua deal ↗`), lalu grid kartu.

**Kartu:** nama brand, `Kategori · Platform`, label komisi, dan tombol hapus dari simpanan.

**Kosong:** `Belum ada campaign tersimpan.` / `Simpan campaign yang kamu suka dari halaman deal untuk melihatnya di sini.` / link `Jelajahi semua deal ↗`

> **Prompt Stitch**
>
> Buat halaman "Campaign yang kamu simpan" di dashboard creator platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, dengan sidebar kiri (item "Tersimpan" dalam keadaan aktif).
>
> Judul section: label kecil "TERSIMPAN", judul "Campaign yang kamu simpan", link "Lihat semua deal ↗" di kanan.
>
> Di bawahnya grid kartu tiga kolom. Setiap kartu berisi nama brand tebal, baris kecil abu "Beauty & Health · TikTok Shop", label komisi tebal "12%", dan ikon bintang terisi di pojok kanan atas yang berfungsi sebagai tombol hapus dari simpanan. Kartu putih, radius 16px, garis tepi tipis.
>
> Buat juga varian kosong halaman ini: blok terpusat berisi kalimat tebal "Belum ada campaign tersimpan.", kalimat abu "Simpan campaign yang kamu suka dari halaman deal untuk melihatnya di sini.", dan link pink "Jelajahi semua deal ↗".

---

### S-11 · Performa
**Route:** `/dashboard/performa` · **File:** [app/dashboard/performa/page.tsx](app/dashboard/performa/page.tsx)

Halaman baca-saja berisi klik milik creator itu sendiri. Tiga section:

1. **Ringkasan** — kicker `PERFORMA`, H2 `Klik link kamu`, lalu 2 kartu KPI: `Klik langsung` dan `Klik dari link dibagikan`.
2. **Top campaign** — kicker `TOP CAMPAIGN`, H2 `Paling banyak diklik`, tabel 2 kolom (`Brand`, `Klik`), maksimal 10 baris. Kosong → `Belum ada klik.` / `Bagikan link campaign kamu untuk mulai memantau performa.`
3. **Aktivitas terbaru** — kicker `AKTIVITAS TERBARU`, H2 `Klik terbaru`, tabel 3 kolom (`Brand`, `Sumber`, `Waktu`), maksimal 20 baris. Nilai kolom Sumber: `Langsung` atau `Dibagikan (ref123)`. Kosong → `Belum ada aktivitas klik.`

Angka diformat gaya Indonesia (`1.284`), waktu memakai format `id-ID` medium + short.

> **Prompt Stitch**
>
> Buat halaman "Performa" di dashboard creator platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, dengan sidebar kiri (item "Performa" aktif).
>
> **Section 1:** label kecil "PERFORMA", judul "Klik link kamu", lalu dua kartu KPI berjajar: "Klik langsung — 1.284" dan "Klik dari link dibagikan — 412". Label kecil di atas, angka besar di bawah.
>
> **Section 2:** label "TOP CAMPAIGN", judul "Paling banyak diklik", lalu tabel dua kolom dengan header "Brand" dan "Klik". Isi enam baris dengan nama brand Indonesia dan angka klik rata kanan, urut dari terbesar: MS Glow 312, Somethinc 244, Scarlett Whitening 198, Wardah 156, Emina 121, Avoskin 97.
>
> **Section 3:** label "AKTIVITAS TERBARU", judul "Klik terbaru", lalu tabel tiga kolom dengan header "Brand", "Sumber", "Waktu". Isi enam baris. Kolom Sumber berisi "Langsung" atau "Dibagikan (ig-story)". Kolom Waktu berformat "20 Agu 2026, 09.12".
>
> Tabel memakai header tebal dengan garis bawah, baris bergaris tipis, kolom angka rata kanan, dan latar putih.

---

### S-12 · Notifikasi
**Route:** `/dashboard/notifikasi` · **File:** [app/dashboard/notifikasi/page.tsx](app/dashboard/notifikasi/page.tsx)

**Struktur:**
1. Panel heading: `WORKSPACE` / `Notifikasi`
2. Toggle push
3. Section daftar: kicker `3 BELUM DIBACA` (atau `SEMUA SUDAH DIBACA`), H2 `Aktivitas akunmu`
4. Daftar notifikasi
5. Paginasi (30 per halaman)

**Toggle push:** baris berlabel `Notifikasi push` dengan tombol `Aktifkan` / `Nonaktifkan`. Kondisi lain: `Browser ini tidak mendukung notifikasi push.` atau `Notifikasi push belum dikonfigurasi.`

**Item notifikasi:** judul tebal, isi satu baris, waktu relatif. Yang belum dibaca ditandai titik pink di kiri dan latar sedikit berbeda. Ada aksi tandai-sudah-dibaca kalau masih ada yang belum dibaca.

**Jenis notifikasi** ([prisma/schema.prisma](prisma/schema.prisma)): `SAMPLE_STATUS_CHANGED` · `SAMPLE_REQUEST_NEW` · `PROFILE_VERIFIED` · `PROFILE_REJECTED` · `CAMPAIGN_NEW` · `CAMPAIGN_ENDING_SOON`.

**Kosong:** `Belum ada notifikasi.` / `Update status sample dan campaign baru akan muncul di sini.`

**Paginasi:** `← Sebelumnya` · `Halaman 1 dari 3 · 74 notifikasi` · `Berikutnya →`

> **Prompt Stitch**
>
> Buat halaman "Notifikasi" di dashboard creator platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, dengan sidebar kiri (item "Notifikasi" aktif).
>
> Di atas: label kecil "WORKSPACE" dan judul besar "Notifikasi".
>
> Di bawahnya satu baris toggle dalam kotak bergaris tipis: teks "Notifikasi push" di kiri dan tombol putih bergaris "Aktifkan" di kanan.
>
> Lalu label kecil huruf kapital "3 BELUM DIBACA" dan judul "Aktivitas akunmu", diikuti daftar notifikasi bertumpuk. Setiap item punya judul tebal, satu baris isi abu, dan waktu kecil di kanan. Tiga item pertama belum dibaca: latarnya pink sangat pucat dengan titik pink kecil di sisi kiri. Contoh isi:
> - "Sample kamu sudah dikirim" — "Request sample MS Glow dikirim lewat JNE, resi JP1234567890."
> - "Campaign baru dari Somethinc" — "Somethinc membuka campaign baru dengan komisi 14%."
> - "Campaign Scarlett Whitening segera berakhir" — "Sisa 3 hari sebelum campaign ini ditutup."
> - "Profil kamu terverifikasi" — "Kamu sekarang bisa mengajukan request sample."
>
> Paling bawah paginasi: "← Sebelumnya", teks tengah "Halaman 1 dari 3 · 74 notifikasi", dan "Berikutnya →".

---

### S-13 · Profil creator
**Route:** `/dashboard/profil` · **File:** [app/dashboard/profil/ProfilTabs.tsx](app/dashboard/profil/ProfilTabs.tsx)

**Struktur:**
1. Section kelengkapan: kicker `PROFIL CREATOR`, H2 `Kelengkapan profil`, lalu activation-card dengan label `STATUS PROFIL`
2. Tab bar 4 pilihan
3. Panel form sesuai tab aktif

**Judul di activation-card:** `Profil kamu sudah lengkap.` (dengan sub `Semua data wajib sudah tersimpan.`) atau `Lengkapi profil untuk mempercepat verifikasi.` (dengan sub `Masih perlu: {daftar field}.`).

**Tab & isinya:**

| Tab | Field | Tombol |
|---|---|---|
| `Data Pribadi` | `Nama lengkap` · `Panggilan` (placeholder `Nama panggilan`) · `Nomor WhatsApp` · bio (placeholder `Ceritakan singkat tentang kontenmu`) | `Simpan Data Pribadi` |
| `Alamat` | `Nama penerima` · `Provinsi` (dropdown, `Pilih provinsi`) · `Kabupaten/Kota` (`Pilih kabupaten/kota`, nonaktif jadi `Pilih provinsi dulu`) · `Kecamatan` (`Pilih kecamatan` / `Pilih kabupaten/kota dulu`) · `Kelurahan/Desa` (`Pilih kelurahan/desa` / `Pilih kecamatan dulu`) · `Alamat lengkap` · RT · RW · kode pos · `Nomor penerima paket` | `Simpan Alamat` |
| `Social Media` | 5 platform, tiap platform punya username + `Followers`: TikTok, Instagram, YouTube, Shopee, TikTok Affiliate | `Simpan Social Media` |
| `Kategori` | Fieldset `Kategori konten (pilih minimal satu)` — checkbox dua kolom | `Simpan Kategori` |

Setiap tab disimpan terpisah dengan Server Action-nya sendiri. Dropdown wilayah bertingkat: memilih provinsi mengaktifkan kabupaten, dan seterusnya.

> **Prompt Stitch**
>
> Buat halaman "Profil creator" di dashboard platform affiliate **TAP by Haluan**. Tema terang, aksen pink `#d81280`, judul font Archivo, dengan sidebar kiri (item "Profil creator" aktif).
>
> **Bagian atas:** label kecil "PROFIL CREATOR", judul "Kelengkapan profil", lalu kartu lebar penuh berisi angka "67" sangat besar dengan "%" kecil di sampingnya, label huruf kapital "STATUS PROFIL", judul "Lengkapi profil untuk mempercepat verifikasi.", dan kalimat "Masih perlu: Kode pos, Nomor penerima paket."
>
> **Tab bar** empat pilihan berbentuk garis bawah: "Data Pribadi" (aktif, garis bawah pink tebal dan teks pink), "Alamat", "Social Media", "Kategori".
>
> **Panel form** di bawah tab, latar putih dengan radius 20px dan garis tepi tipis. Tampilkan isi tab "Alamat" karena tab ini yang paling padat:
> - Field "Nama penerima"
> - Baris dua kolom: dropdown "Provinsi" (nilai "Jawa Barat") dan dropdown "Kabupaten/Kota" (nilai "Kota Bandung")
> - Baris dua kolom: dropdown "Kecamatan" (nilai "Coblong") dan dropdown "Kelurahan/Desa" (placeholder abu "Pilih kelurahan/desa")
> - Textarea "Alamat lengkap"
> - Baris tiga kolom: "RT", "RW", "Kode pos"
> - Field "Nomor penerima paket"
> - Tombol pink lebar penuh "Simpan Alamat"
>
> Label 14px di atas field, field setinggi 44px dengan radius 12px, dropdown memakai ikon panah bawah kecil di kanan.

---

## 5C. Admin workspace

Semua layar admin memakai shell yang sama. Nada visualnya lebih padat dan operasional dibanding permukaan publik: tabel penuh, filterbar, paginasi, sedikit ilustrasi.

### Shell admin
**File:** [app/admin/(dashboard)/layout.tsx](app/admin/(dashboard)/layout.tsx) + [app/admin/(dashboard)/AdminNav.tsx](app/admin/(dashboard)/AdminNav.tsx)

**Sidebar kiri:** logo Haluan + divider + `TAP` di atas. Label `ADMIN WORKSPACE`, lalu 9 item:

| Ikon | Label | Route |
|---|---|---|
| ▦ | Ringkasan | `/admin` |
| ◎ | Brand | `/admin/brand` |
| ⌁ | Campaign | `/admin/campaign` |
| ▧ | Produk | `/admin/produk` |
| ∞ | Link | `/admin/link` |
| ◐ | Kategori | `/admin/kategori` |
| ☺ | Creator | `/admin/creator` |
| + | Sample | `/admin/sample` |
| △ | Analitik | `/admin/analitik` |

Untuk super admin, muncul label kedua `SUPER ADMIN` dengan 3 item: `◆ Pengguna & Peran` · `▤ Audit Log` · `⇩ Import Data`.

Paling bawah sidebar: kartu `◆ Protected workspace` / `Data creator hanya tersedia untuk administrator terverifikasi.`

**Header atas:** teks kecil `HALUAN AFFILIATE OPERATIONS` di kiri. Di kanan: link `← Dashboard creator`, blok nama (`<Nama>` tebal + `Administrator terverifikasi` atau `Super Admin terverifikasi`), avatar inisial, tombol `Keluar`.

**MobileNav tidak muncul di halaman admin.**

---

### S-15 · Ringkasan admin
**Route:** `/admin` · **File:** [app/admin/(dashboard)/page.tsx](app/admin/(dashboard)/page.tsx)

**Struktur:** panel heading (`RINGKASAN` / `Halo, Admin`), 4 kartu KPI, satu tombol.

**KPI:** `Brand aktif` · `Campaign aktif` · `Sample menunggu` · `Creator menunggu verifikasi`.

**Tombol:** `Lihat analitik klik dan funnel campaign ↗`

> **Prompt Stitch**
>
> Buat halaman ringkasan admin untuk workspace operasional platform affiliate **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo. Tampilan operasional yang padat, bukan marketing.
>
> **Sidebar kiri gelap** selebar 240px dengan latar `#0c0c11` dan teks putih: logo "TAP" di atas, label kecil abu "ADMIN WORKSPACE", lalu daftar menu dengan ikon glyph: Ringkasan (aktif, latar pink dengan teks putih), Brand, Campaign, Produk, Link, Kategori, Creator, Sample, Analitik. Lalu label kedua "SUPER ADMIN" dengan tiga item: Pengguna & Peran, Audit Log, Import Data. Di bagian paling bawah kartu kecil bergaris berisi "Protected workspace" tebal dan kalimat "Data creator hanya tersedia untuk administrator terverifikasi."
>
> **Header atas** area konten: teks kecil huruf kapital abu "HALUAN AFFILIATE OPERATIONS" di kiri. Di kanan: link "← Dashboard creator", blok nama "Dimas Prakoso" tebal dengan baris kecil "Super Admin terverifikasi", avatar bulat berisi "D", dan tombol teks "Keluar".
>
> **Konten:** label kecil "RINGKASAN", judul besar "Halo, Admin". Lalu empat kartu KPI berjajar: "Brand aktif 416", "Campaign aktif 512", "Sample menunggu 23", "Creator menunggu verifikasi 47". Label kecil di atas, angka besar di bawah. Di bawahnya satu tombol putih bergaris "Lihat analitik klik dan funnel campaign ↗".

---

### S-16 · Kelola brand
**Route:** `/admin/brand` · **File:** [app/admin/(dashboard)/brand/page.tsx](app/admin/(dashboard)/brand/page.tsx)

**Struktur:** panel heading (`BRAND` / `Kelola brand` / tombol pink `Tambah brand`) → filterbar → tabel → paginasi (50 per halaman).

**Filterbar:** field pencarian `Cari brand…` + dropdown status (`Semua status` / `Aktif` / `Arsip`) + tombol `Terapkan`.

**Kolom tabel:** nama brand (dengan logo kecil), kategori, jumlah campaign, penanda unggulan, status, aksi.

**Paginasi:** `Halaman 1 dari 9 · 416 brand`

> **Prompt Stitch**
>
> Buat halaman "Kelola brand" di workspace admin platform affiliate **TAP by Haluan**. Tema terang untuk area konten, sidebar kiri gelap `#0c0c11` berisi menu admin (Ringkasan, Brand aktif, Campaign, Produk, Link, Kategori, Creator, Sample, Analitik). Aksen pink `#d81280`, judul font Archivo.
>
> **Konten:** label kecil "BRAND", judul "Kelola brand" di kiri, tombol pink "Tambah brand" di kanan.
>
> **Filterbar** satu baris: field pencarian berikon kaca pembesar dengan placeholder "Cari brand…", dropdown "Semua status", dan tombol putih bergaris "Terapkan".
>
> **Tabel** lebar penuh dengan header tebal bergaris bawah dan kolom: "Brand", "Kategori", "Campaign", "Unggulan", "Status", dan kolom aksi kosong di ujung. Isi delapan baris dengan logo brand persegi kecil 28px di samping nama brand tebal. Contoh isi: "MS Glow — Beauty & Health — 4 — ★ — Aktif — Kelola", "Somethinc — Beauty & Health — 3 — — Aktif — Kelola", "Wardah — Beauty & Health — 2 — — Aktif — Kelola", "Uniqlo — Fashion — 1 — — Arsip — Kelola". Kolom angka rata kanan. Kolom Status memakai badge pil kecil: hijau pucat untuk "Aktif", abu untuk "Arsip". Kolom aksi berisi link pink "Kelola".
>
> **Paginasi** di bawah tabel: "← Sebelumnya" di kiri, teks tengah "Halaman 1 dari 9 · 416 brand", "Berikutnya →" di kanan.

---

### S-17 · Detail & edit brand
**Route:** `/admin/brand/[id]` · **File:** [app/admin/(dashboard)/brand/[id]/page.tsx](app/admin/(dashboard)/brand/[id]/page.tsx)

**Struktur:**
1. Panel heading: `BRAND` / nama brand / tombol `← Kembali`
2. Form brand
3. Panel campaign terhubung
4. Form merge

**Form brand:** `Nama brand` · `Kategori` (dropdown, opsi kosong berbunyi `Lainnya`) · field unggah logo dengan pratinjau · dua checkbox berdampingan (`Sembunyikan dari katalog`, `Jadikan unggulan`) · tombol `Simpan brand`.

**Panel campaign:** heading `CAMPAIGN` / `4 campaign terhubung`, tabel kolom `Platform`, `Status`, `Tier`, aksi `Kelola →`. Kosong → `Belum ada campaign untuk brand ini.`

**Form merge:** menggabungkan brand duplikat ke brand lain.

**Varian `Tambah brand`** (`/admin/brand/new`) — halaman yang sama tanpa panel campaign dan tanpa form merge. Heading `BRAND` / `Tambah brand`, dan dua checkbox (`Sembunyikan dari katalog`, `Jadikan unggulan`) **tidak ditampilkan** saat membuat brand baru. Tidak perlu prompt terpisah: jalankan prompt di bawah lalu minta Stitch menghapus dua panel terakhir.

> **Prompt Stitch**
>
> Buat halaman detail dan edit brand di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin, area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Di atas: label kecil "BRAND", judul besar "MS Glow", tombol teks "← Kembali" di kanan.
>
> **Panel form** putih dengan radius 20px: field "Nama brand" (nilai "MS Glow"), dropdown "Kategori" (nilai "Beauty & Health"), lalu blok unggah logo berupa kotak pratinjau persegi 96px berisi logo brand dengan tombol "Ganti logo" di sampingnya. Di bawahnya dua checkbox berdampingan: "Sembunyikan dari katalog" dan "Jadikan unggulan" (yang kedua tercentang). Tombol pink "Simpan brand".
>
> **Panel kedua:** label "CAMPAIGN", judul "4 campaign terhubung", lalu tabel kecil kolom "Platform", "Status", "Tier", dan kolom aksi. Isi empat baris: "TikTok Shop — ACTIVE — 3 — Kelola →", "TikTok Shop — ENDED — 2 — Kelola →", "Shopee — ACTIVE — 1 — Kelola →", "Shopee — HIDDEN — 1 — Kelola →".
>
> **Panel ketiga:** blok gabungkan brand duplikat, berisi dropdown pemilih brand tujuan dan tombol peringatan berwarna merah pucat "Gabungkan brand".

---

### S-18 · Kelola campaign
**Route:** `/admin/campaign` · **File:** [app/admin/(dashboard)/campaign/page.tsx](app/admin/(dashboard)/campaign/page.tsx)

**Struktur:** panel heading (`CAMPAIGN` / `Kelola campaign` / tombol pink `Tambah campaign`) → filterbar tiga kontrol → tabel → paginasi (50 per halaman).

**Filterbar:** `Cari nama brand…` + dropdown platform (`Semua platform` / `TikTok Shop` / `Shopee`) + dropdown status (`Semua status` / `Aktif` / `Berakhir` / `Disembunyikan`) + `Terapkan`.

**Kolom tabel:** `Brand` · `Platform` · `Komisi` · `Tier` · `Status` · aksi `Kelola`.

**Format kolom komisi:** rentang seperti `9% – 12%`, satu angka `12%`, atau `Ketentuan platform` untuk Shopee. Kalau tidak ada nilai: `—`.

**Label status:** `Aktif` · `Berakhir` · `Disembunyikan`.

**Kosong:** `Belum ada campaign yang cocok dengan filter ini.`

> **Prompt Stitch**
>
> Buat halaman "Kelola campaign" di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin (Campaign dalam keadaan aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "CAMPAIGN", judul "Kelola campaign" di kiri, tombol pink "Tambah campaign" di kanan.
>
> **Filterbar** satu baris berisi field pencarian "Cari nama brand…", dropdown "Semua platform", dropdown "Semua status", dan tombol "Terapkan".
>
> **Tabel** dengan kolom "Brand", "Platform", "Komisi", "Tier", "Status", dan kolom aksi. Isi delapan baris:
> - MS Glow — TikTok Shop — 9% – 12% — 3 — badge hijau "Aktif" — Kelola
> - Somethinc — TikTok Shop — 14% — 1 — badge hijau "Aktif" — Kelola
> - Scarlett Whitening — TikTok Shop — 8% – 15% — 4 — badge hijau "Aktif" — Kelola
> - Wardah — Shopee — Ketentuan platform — 1 — badge hijau "Aktif" — Kelola
> - Emina — Shopee — Ketentuan platform — 1 — badge abu "Berakhir" — Kelola
> - Uniqlo — TikTok Shop — — — 0 — badge abu "Disembunyikan" — Kelola
>
> Kolom Tier rata kanan. Perhatikan bahwa baris Shopee **tidak pernah menampilkan angka persen** — selalu teks "Ketentuan platform".
>
> Paginasi di bawah: "← Sebelumnya", "Halaman 1 dari 11 · 512 campaign", "Berikutnya →".

---

### S-19 · Edit campaign
**Route:** `/admin/campaign/[id]` · **File:** [app/admin/(dashboard)/campaign/[id]/page.tsx](app/admin/(dashboard)/campaign/[id]/page.tsx)

**Struktur:**
1. Panel heading: `CAMPAIGN` / nama brand / `← Kembali`
2. Baris meta: `TikTok Shop · Tipe komisi: Persentase · Slug: ms-glow`
3. Form campaign
4. Panel editor tier & link

**Form campaign** — grid empat field:

| Field | Bentuk |
|---|---|
| `Status` | dropdown `Aktif` / `Berakhir` / `Disembunyikan` |
| `Kuota sample` | angka, placeholder `Tanpa batas`, hint `Tersisa saat ini: 12. Menaikkan kuota otomatis menambah sisa sebesar selisihnya.` |
| `Bobot urutan tampil` | angka |
| `Berlaku sampai` | date picker |

Lalu dua textarea lebar penuh: `Brief campaign` dan `Syarat creator`. Lalu dua checkbox berdampingan: `SKU baru` dan `Harga spesial live`. Tombol `Simpan campaign`.

**Editor tier & link:** heading `TIER & LINK` / `3 baris`. Setiap baris punya empat kontrol dalam satu garis: input angka komisi (placeholder `Komisi %`, **dinonaktifkan dan berubah jadi `Ketentuan platform` untuk campaign Shopee**), input URL (`https://…`), input teks `Label tier`, dan tombol `Hapus` merah. Di bawah daftar: tombol `+ Tambah tier` dan `Simpan tier & link`.

**Varian `Tambah campaign`** (`/admin/campaign/new`) — layar jauh lebih ringkas. Heading `CAMPAIGN` / `Tambah campaign`, lalu filterbar berisi pencarian `Cari nama brand…` + tombol `Cari`, lalu form tiga field: dropdown `Brand` (kosong sampai ada pencarian — placeholder `Cari brand dulu di atas` atau `Tidak ada brand yang cocok`), dropdown `Platform` (`TikTok Shop` / `Shopee`), dropdown `Tipe komisi` (`Persentase` / `Ketentuan platform`). Tombol `Buat campaign`. Tier dan link baru diisi setelah campaign-nya jadi.

> **Prompt Stitch**
>
> Buat halaman edit campaign di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin, area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Di atas: label "CAMPAIGN", judul "MS Glow", tombol "← Kembali" di kanan. Di bawah judul satu baris teks abu kecil: "TikTok Shop · Tipe komisi: Persentase · Slug: `ms-glow`".
>
> **Panel form pertama:** grid dua kolom berisi empat field — dropdown "Status" (nilai "Aktif"), field angka "Kuota sample" (nilai 50) dengan teks bantuan abu di bawahnya "Tersisa saat ini: 12. Menaikkan kuota otomatis menambah sisa sebesar selisihnya.", field angka "Bobot urutan tampil" (nilai 0), dan date picker "Berlaku sampai" (nilai 31/12/2026). Lalu dua textarea lebar penuh berlabel "Brief campaign" dan "Syarat creator". Lalu dua checkbox berdampingan "SKU baru" dan "Harga spesial live". Tombol pink "Simpan campaign".
>
> **Panel kedua:** label "TIER & LINK", judul "3 baris". Di bawahnya tiga baris editor, masing-masing satu garis horizontal berisi empat kontrol: field angka sempit dengan placeholder "Komisi %", field URL lebar dengan placeholder "https://…", field teks dengan placeholder "Label tier", dan tombol teks merah "Hapus". Di bawah ketiganya dua tombol berdampingan: "+ Tambah tier" (putih bergaris) dan "Simpan tier & link" (pink).

---

### S-20 · Produk & Link (tabel audit)
**Route:** `/admin/produk` dan `/admin/link` · **File:** [app/admin/(dashboard)/produk/page.tsx](app/admin/(dashboard)/produk/page.tsx), [app/admin/(dashboard)/link/page.tsx](app/admin/(dashboard)/link/page.tsx)

Dua halaman baca-saja dengan bentuk identik. Keduanya punya catatan yang sama:

> `Daftar tier untuk audit cepat. Edit dilakukan di halaman campaign masing-masing agar tidak ada dua jalur tulis untuk data yang sama.`

| | Produk | Link |
|---|---|---|
| Heading | `PRODUK` / `Daftar tier campaign` | `LINK` / `Daftar link campaign` |
| Pencarian | `Cari brand atau label tier…` | `Cari brand atau URL…` |
| Kolom | Brand · Platform · Tier · Komisi · aksi | Brand · Platform · URL · Utama · aksi |
| Kosong | `Tidak ada tier yang cocok dengan pencarian ini.` | `Tidak ada link yang cocok dengan pencarian ini.` |

URL dipotong di 60 karakter dengan `…`. Kolom `Utama` menampilkan badge `Utama` hanya pada link primer.

> **Prompt Stitch**
>
> Buat halaman "Daftar link campaign" di workspace admin platform affiliate **TAP by Haluan**. Halaman baca-saja untuk audit. Sidebar kiri gelap `#0c0c11` dengan menu admin (item "Link" aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "LINK", judul "Daftar link campaign". Di bawah judul satu paragraf abu kecil: "Daftar link untuk audit cepat. Edit dilakukan di halaman campaign masing-masing agar tidak ada dua jalur tulis untuk data yang sama."
>
> **Filterbar** hanya satu field pencarian berikon kaca pembesar dengan placeholder "Cari brand atau URL…" dan tombol "Cari".
>
> **Tabel** dengan kolom "Brand", "Platform", "URL", "Utama", dan kolom aksi. Isi delapan baris. Kolom URL berisi tautan biru-pink panjang yang terpotong dengan tanda "…" di akhir, misalnya "https://vt.tiktok.com/ZSAbcDeFg/?utm_source=haluan&utm_campaign=…". Kolom "Utama" hanya diisi badge pil hijau kecil bertuliskan "Utama" pada sebagian baris saja, sisanya kosong. Kolom aksi berisi link pink "Kelola →".
>
> Paginasi di bawah: "← Sebelumnya", "Halaman 1 dari 15 · 742 link", "Berikutnya →".

---

### S-21 · Kategori
**Route:** `/admin/kategori` · **File:** [app/admin/(dashboard)/kategori/page.tsx](app/admin/(dashboard)/kategori/page.tsx)

**Struktur:** panel heading (`KATEGORI` / `Kelola kategori brand`) → panel `BARU` / `Tambah kategori` berisi form ringkas → tabel.

**Kolom tabel:** `Nama` · `Slug` · `Brand` (jumlah) · aksi (edit inline & hapus).

**Kosong:** `Belum ada kategori.`

> **Prompt Stitch**
>
> Buat halaman "Kelola kategori brand" di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin (item "Kategori" aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "KATEGORI", judul "Kelola kategori brand".
>
> **Panel tambah:** kotak putih dengan label kecil "BARU" dan judul "Tambah kategori", berisi satu field "Nama kategori" dan tombol pink "Tambah" berdampingan dalam satu baris.
>
> **Tabel** dengan kolom "Nama", "Slug", "Brand", dan kolom aksi. Isi tujuh baris: "Beauty & Health — beauty-health — 96", "Fashion — fashion — 61", "Food & FMCG — food-fmcg — 48", "Home & Living — home-living — 42", "Tech — tech — 37", "Mom & Baby — mom-baby — 24", "Lainnya — lainnya — 12". Kolom Brand rata kanan. Kolom aksi berisi dua link kecil: "Ubah" pink dan "Hapus" merah.

---

### S-22 · Database kreator
**Route:** `/admin/creator` · **File:** [app/admin/(dashboard)/creator/page.tsx](app/admin/(dashboard)/creator/page.tsx)

**Struktur:** panel heading (`KREATOR` / `Database kreator`) → filterbar → tabel → paginasi (50 per halaman).

**Filterbar:** pencarian `Cari nama, email, telepon, username…` + dropdown status (`Semua status` / `Pending` / `Terverifikasi` / `Ditolak` / `Ditangguhkan`) + `Terapkan`.

**Kolom tabel:** nama, email, handle (`@username` atau `—`), followers, status membership, tanggal bergabung, aksi.

> **Prompt Stitch**
>
> Buat halaman "Database kreator" di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin (item "Creator" aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "KREATOR", judul "Database kreator".
>
> **Filterbar:** field pencarian berikon kaca pembesar dengan placeholder "Cari nama, email, telepon, username…", dropdown "Semua status", dan tombol "Terapkan".
>
> **Tabel** dengan kolom "Nama", "Email", "Username", "Followers", "Status", "Bergabung", dan kolom aksi. Isi delapan baris dengan nama Indonesia. Contoh: "Rani Puspita — rani@email.com — @ranipuspita — 48.200 — badge kuning pucat 'Pending' — 12 Agu 2026 — Detail", "Dimas Aditya — dimas@email.com — @dimasaditya — 120.400 — badge hijau pucat 'Terverifikasi' — 03 Jul 2026 — Detail", "Sari Melati — sari@email.com — — — — — badge merah pucat 'Ditolak' — 28 Jun 2026 — Detail", dan satu baris dengan badge abu "Ditangguhkan".
>
> Kolom Followers rata kanan dengan format ribuan bertitik. Kolom aksi berisi link pink "Detail".
>
> Paginasi: "← Sebelumnya", "Halaman 1 dari 8 · 384 kreator", "Berikutnya →".

---

### S-23 · Detail kreator
**Route:** `/admin/creator/[id]` · **File:** [app/admin/(dashboard)/creator/[id]/page.tsx](app/admin/(dashboard)/creator/[id]/page.tsx)

Halaman panel bertumpuk. Membuka halaman ini sendiri tercatat di audit log sebagai `creator_address.view` — terpisah dari mengeditnya.

| Panel | Kicker / judul | Isi |
|---|---|---|
| 1 | `DATA PRIBADI` / `Informasi akun` | Nama · Email · Telepon · Provider · Email terverifikasi · Sumber verifikasi. Badge status membership di kanan heading. |
| 2 | `AKUN SOSIAL` / `TikTok / Shopee` | TikTok · Shopee · Niche · Followers |
| 3 | `ALAMAT PENGIRIMAN` / `Alamat kreator` | Penerima · Detail alamat · Wilayah (desa, kecamatan, kabupaten, provinsi) · RT/RW · Kode pos. Kosong → `Belum ada alamat.` |
| 4 | `SAMPLE REQUEST` / `5 request terakhir` | Tabel Brand · Status · Tanggal. Kosong → `Belum ada request sample.` |
| 5 | `MEMBERSHIP` / `Kelola status kreator` | Tombol aksi |

**Tombol aksi membership**, muncul kondisional:

| Tombol | Muncul saat |
|---|---|
| `Verifikasi` | status bukan `VERIFIED` |
| `Suspend` | status `VERIFIED` |
| `Tolak` | status bukan `REJECTED` |
| `Kembalikan ke pending` | status `REJECTED` atau `SUSPENDED` |

Label membership: `Pending` · `Terverifikasi` · `Ditolak` · `Ditangguhkan`.

> **Prompt Stitch**
>
> Buat halaman detail kreator di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin, area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Di atas: label "KREATOR", judul besar "Rani Puspita", tombol "← Kembali" di kanan.
>
> **Panel 1** — label "DATA PRIBADI", judul "Informasi akun", dan badge pil kuning pucat "Pending" di kanan heading. Isinya grid dua kolom berisi pasangan label tebal dan nilai: "Nama / Rani Puspita", "Email / rani@email.com", "Telepon / 081234567890", "Provider / CREDENTIALS", "Email terverifikasi / 12 Agu 2026", "Sumber verifikasi / CODE".
>
> **Panel 2** — label "AKUN SOSIAL", judul "TikTok / Shopee", grid dua kolom: "TikTok / @ranipuspita", "Shopee / —", "Niche / Beauty & skincare", "Followers / 48.200".
>
> **Panel 3** — label "ALAMAT PENGIRIMAN", judul "Alamat kreator", grid dua kolom: "Penerima / Rani Puspita · 081234567890", "Detail alamat / Jl. Cihampelas No. 42", "Wilayah / Lebak Siliwangi, Coblong, Kota Bandung, Jawa Barat", "RT/RW / 003/005", "Kode pos / 40132".
>
> **Panel 4** — label "SAMPLE REQUEST", judul "5 request terakhir", tabel kecil kolom "Brand", "Status", "Tanggal" berisi tiga baris dengan badge status berwarna.
>
> **Panel 5** — label "MEMBERSHIP", judul "Kelola status kreator", berisi baris tombol: tombol pink "Verifikasi" dan tombol putih bergaris merah "Tolak".
>
> Semua panel putih dengan radius 20px, garis tepi tipis, dan jarak antar panel 24px.

---

### S-24 · Antrean & detail sample
**Route:** `/admin/sample`, `/admin/sample/[id]` · **File:** [app/admin/(dashboard)/sample/page.tsx](app/admin/(dashboard)/sample/page.tsx), [app/admin/(dashboard)/sample/[id]/page.tsx](app/admin/(dashboard)/sample/[id]/page.tsx)

**Antrean (20 per halaman):** panel heading `SAMPLE` / `Antrean request sample`, filterbar (pencarian `Cari brand, username, atau nomor resi…` + dropdown status yang **default-nya `PENDING`, bukan semua**), lalu tabel kolom `Brand` · `Creator` · `Username` · `Status` · `Diajukan` · aksi `Detail`.

**Kosong:** `Tidak ada request sample yang cocok dengan filter ini.`

**Detail request** — panel bertumpuk:

| Panel | Isi |
|---|---|
| `STATUS` | Judul = label status, badge di kanan. Blok lifecycle berisi baris bertanggal: `Diajukan: …`, `Disetujui: …`, `Dikirim: …`, `Selesai: …`, `Dibatalkan: …`, `Alasan penolakan: …`, `Catatan persetujuan: …`, `Kurir/resi: JNE · JP1234567890` |
| Form aksi | Tombol sesuai status saat ini: setujui (dengan catatan), tolak (dengan alasan), kirim (isi kurir + resi), selesaikan |
| `CREATOR` | Nama sebagai judul, lalu Email · Username · Profil (tautan) |
| `CAMPAIGN` | Platform · Status campaign. Kalau tidak terhubung → `Request ini tidak terhubung ke campaign aktif (data lama atau brand belum tercatat sebagai campaign).` |
| `ALAMAT PENGIRIMAN` / `Snapshot alamat` | Penerima · No. HP · detail alamat · wilayah · RT/RW · kode pos. Kosong → `Alamat belum tersedia.` |

Alamat di sini adalah **snapshot yang diambil saat approval** — edit profil creator setelahnya tidak mengubah request yang sudah disetujui.

**Label status:** `Diajukan` · `Disetujui` · `Dikirim` · `Selesai` · `Ditolak` · `Dibatalkan`.

> **Prompt Stitch**
>
> Buat dua layar untuk pengelolaan request sample di workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin (item "Sample" aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> **Layar 1 — antrean.** Label "SAMPLE", judul "Antrean request sample". Filterbar berisi field pencarian "Cari brand, username, atau nomor resi…", dropdown status dengan nilai terpilih "Diajukan", dan tombol "Terapkan". Tabel dengan kolom "Brand", "Creator", "Username", "Status", "Diajukan", dan kolom aksi. Isi delapan baris dengan nama brand kosmetik Indonesia dan nama creator Indonesia. Kolom Status memakai badge pil berwarna: kuning pucat "Diajukan", biru pucat "Disetujui", hijau pucat "Dikirim", hijau "Selesai", merah pucat "Ditolak", abu "Dibatalkan". Kolom Diajukan berformat "20/08/2026 09.12". Kolom aksi berisi link pink "Detail". Paginasi: "Halaman 1 dari 4 · 68 request".
>
> **Layar 2 — detail request.** Label "SAMPLE", judul "MS Glow", tombol "← Kembali". Lalu panel bertumpuk:
> - Panel "STATUS" dengan judul "Dikirim" dan badge hijau pucat "Dikirim" di kanan. Isinya daftar baris bertanggal: "Diajukan: 20/08/2026 09.12", "Disetujui: 21/08/2026 14.03", "Dikirim: 22/08/2026 10.45", "Kurir/resi: JNE · JP1234567890".
> - Panel form aksi berisi field "Kurir" dan "Nomor resi" berdampingan, plus tombol pink "Tandai selesai" dan tombol putih bergaris "Tolak request".
> - Panel "CREATOR" dengan judul "Rani Puspita" dan baris "Email: rani@email.com", "Username: @ranipuspita", "Profil: https://tiktok.com/@ranipuspita".
> - Panel "CAMPAIGN" dengan baris "Platform: TikTok Shop", "Status campaign: ACTIVE".
> - Panel "ALAMAT PENGIRIMAN" berjudul "Snapshot alamat" dengan baris alamat lengkap Indonesia.

---

### S-25 · Analitik
**Route:** `/admin/analitik` · **File:** [app/admin/(dashboard)/analitik/page.tsx](app/admin/(dashboard)/analitik/page.tsx)

Seluruh halaman memakai jendela **30 hari terakhir**.

**Struktur:**
1. Panel heading: `ANALITIK` / `Performa 30 hari terakhir`
2. Empat kartu KPI
3. Panel tren harian
4. Dua panel berdampingan: Top campaign & Top kreator
5. Panel platform
6. Panel funnel

**KPI:**

| Label | Keterangan kecil |
|---|---|
| `TOTAL KLIK` | `30 hari terakhir` |
| `TOTAL REQUEST SAMPLE` | `30 hari terakhir` |
| `KREATOR AKTIF` | `klik dari kreator unik` |
| `KONVERSI KLIK → SAMPLE` | `request / klik` — ditulis `—` kalau tidak bisa dihitung |

**Tren harian:** panel `TREN HARIAN` / `Klik per hari`, berisi 30 bar vertikal tipis. Tingginya proporsional terhadap hari tersibuk, bukan terhadap angka absolut. Diberi label aksesibilitas `Grafik batang jumlah klik harian selama 30 hari terakhir`.

**Top campaign & Top kreator:** dua panel berdampingan, masing-masing kicker + `Klik terbanyak`, berisi hingga 10 `metric-line` (nama, bar horizontal, angka). Kosong → `Belum ada klik pada periode ini.` / `Belum ada klik dari kreator pada periode ini.`

**Platform:** panel `PLATFORM` / `TikTok Shop vs Shopee Affiliate`, dua `metric-line`.

**Funnel:** panel `FUNNEL` / `Klik → Request → Approved`, tiga `metric-line`: `Klik`, `Request sample`, `Sample disetujui`.

> **Prompt Stitch**
>
> Buat halaman analitik untuk workspace admin platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin (item "Analitik" aktif), area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "ANALITIK", judul besar "Performa 30 hari terakhir".
>
> **Empat kartu KPI berjajar,** masing-masing punya label kecil huruf kapital di atas, angka besar di tengah, dan keterangan abu kecil di bawah:
> - "TOTAL KLIK — 18.420 — 30 hari terakhir"
> - "TOTAL REQUEST SAMPLE — 312 — 30 hari terakhir"
> - "KREATOR AKTIF — 187 — klik dari kreator unik"
> - "KONVERSI KLIK → SAMPLE — 1,7% — request / klik"
>
> **Panel tren harian:** label "TREN HARIAN", judul "Klik per hari", lalu grafik batang berisi 30 bar vertikal tipis berwarna pink dengan tinggi bervariasi, rapat tanpa sumbu, hanya bar saja di atas garis dasar.
>
> **Dua panel berdampingan.** Panel kiri: label "TOP CAMPAIGN", judul "Klik terbanyak", lalu enam baris metrik. Setiap baris berisi nama brand di kiri, bar horizontal pink berukuran proporsional di tengah, dan angka tebal di kanan. Contoh: MS Glow 2.140, Somethinc 1.880, Scarlett Whitening 1.512, Wardah 1.204, Emina 940, Avoskin 712. Panel kanan: label "TOP KREATOR", judul "Klik terbanyak", enam baris serupa dengan username: @ranipuspita 812, @dimasaditya 704, @sarimelati 588, @bayuprakoso 471, @nadyaayu 402, @rizkyfebri 355.
>
> **Panel platform:** label "PLATFORM", judul "TikTok Shop vs Shopee Affiliate", dua baris metrik: "TikTok Shop 14.208" dan "Shopee Affiliate 4.212".
>
> **Panel funnel:** label "FUNNEL", judul "Klik → Request → Approved", tiga baris metrik dengan bar makin pendek: "Klik 18.420", "Request sample 312", "Sample disetujui 198".
>
> Semua panel putih dengan radius 20px dan garis tepi tipis.

---

### S-26 · Super admin: Pengguna, Audit, Import
**Route:** `/admin/pengguna`, `/admin/audit`, `/admin/import`

Tiga halaman yang hanya terlihat oleh `SUPER_ADMIN`.

**Pengguna & peran** ([app/admin/(dashboard)/pengguna/page.tsx](app/admin/(dashboard)/pengguna/page.tsx)) — heading `SUPER ADMIN` / `Pengguna & peran`. Di bawah judul ada catatan penting:

> `Peran ADMIN dikelola otomatis dari daftar ADMIN_EMAILS setiap request — mengubahnya di sini tidak akan bertahan selama email masih ada di allowlist. Kontrol di bawah hanya untuk mempromosikan atau menurunkan status Super Admin, yang murni manual.`

Tabel: `Nama` (baris sendiri ditandai ` (kamu)`) · `Email` · `Peran` (`Admin` / `Super Admin`) · aksi. Baris sendiri tidak punya tombol aksi. Kosong → `Belum ada akun Admin atau Super Admin.`

**Audit log** ([app/admin/(dashboard)/audit/page.tsx](app/admin/(dashboard)/audit/page.tsx)) — heading `SUPER ADMIN` / `Audit log`, pencarian `Cari berdasarkan aksi atau entitas…`, tabel `Waktu` · `Aktor` · `Aksi` · `Entitas` · `Detail`. Kolom Detail berisi accordion `Lihat JSON` yang membuka blok kode berisi `before`/`after`. Kosong → `Tidak ada log yang cocok dengan pencarian ini.` 50 baris per halaman.

**Import data brand** ([app/admin/(dashboard)/import/page.tsx](app/admin/(dashboard)/import/page.tsx)) — heading `SUPER ADMIN` / `Import data brand`. Isinya:

1. Kotak petunjuk `Cara mengisi template CSV` dengan lima poin: `nama` (wajib), `kategori` (opsional, harus sama persis dengan kategori yang ada), `logo` (opsional), `sembunyikan` (`TRUE`/`FALSE`), `unggulan` (`TRUE`).
2. Tombol `Unduh template CSV`
3. Textarea `Tempel CSV brand (kolom: nama, kategori, logo, sembunyikan, unggulan)` dengan placeholder berisi contoh baris
4. Field unggah `…atau unggah file CSV`
5. Tombol `Pratinjau`
6. Panel pratinjau: `PRATINJAU` / `48 baris dibaca` + 4 KPI (`Baru`, `Diperbarui`, `Tanpa perubahan`, `Gagal`) + daftar baris gagal (`Baris 12` + alasan) + tombol konfirmasi
7. Tabel riwayat: `RIWAYAT` / `10 impor terakhir`, kolom `Waktu` · `Oleh` · `Baru` · `Diperbarui` · `Gagal` · `Total ditulis`. Kosong → `Belum ada riwayat import.`

> **Prompt Stitch**
>
> Buat halaman "Import data brand" untuk super admin di workspace platform affiliate **TAP by Haluan**. Sidebar kiri gelap `#0c0c11` dengan menu admin dan bagian "SUPER ADMIN" berisi Pengguna & Peran, Audit Log, Import Data (aktif). Area konten tema terang, aksen pink `#d81280`, judul font Archivo.
>
> Label kecil "SUPER ADMIN", judul "Import data brand".
>
> **Kotak petunjuk** berlatar kuning sangat pucat dengan garis tepi tipis: judul tebal "Cara mengisi template CSV" dan daftar berpoin lima item, tiap item dimulai dengan nama kolom tebal: "**nama** — wajib diisi, persis seperti nama brand yang ingin ditampilkan.", "**kategori** — opsional. Harus sama persis dengan salah satu kategori di halaman Kategori.", "**logo** — opsional, boleh dikosongkan dulu.", "**sembunyikan** — isi TRUE kalau brand ini belum boleh tampil ke publik.", "**unggulan** — isi TRUE kalau brand ini ingin ditonjolkan sebagai unggulan."
>
> **Tombol putih bergaris** "Unduh template CSV".
>
> **Blok unggah:** textarea besar delapan baris berlabel "Tempel CSV brand (kolom: nama, kategori, logo, sembunyikan, unggulan)" berisi teks contoh monospace, lalu field unggah file berlabel "…atau unggah file CSV", lalu tombol pink "Pratinjau".
>
> **Panel pratinjau hasil:** label "PRATINJAU", judul "48 baris dibaca", lalu empat kartu KPI kecil berjajar: "Baru 12", "Diperbarui 31", "Tanpa perubahan 3", "Gagal 2". Di bawahnya dua baris peringatan merah pucat: "Baris 12 — kategori tidak dikenali" dan "Baris 37 — nama kosong". Lalu tombol pink "Konfirmasi import".
>
> **Tabel riwayat:** label "RIWAYAT", judul "10 impor terakhir", tabel kolom "Waktu", "Oleh", "Baru", "Diperbarui", "Gagal", "Total ditulis" berisi empat baris. Kolom angka rata kanan.

---

### S-27 · Login admin
**Route:** `/admin/login` · **File:** [app/admin/login/AdminAuthClient.tsx](app/admin/login/AdminAuthClient.tsx)

Pintu masuk terpisah dari `/daftar`. Bentuknya mirip S-06 tapi lebih sempit: tanpa tab `Daftar`/`Masuk` (admin tidak mendaftar sendiri) dan tanpa kolom konteks pemasaran.

**Mode:** `login` · `verify` · `forgot` · `reset` — tidak ada mode register.

| Mode | Kicker | Judul | Sub |
|---|---|---|---|
| login | `MASUK ADMIN` | `Masuk ke panel admin.` | `Gunakan email yang sudah terdaftar di allowlist admin.` |
| verify | `VERIFIKASI EMAIL` | `Cek email kamu.` | — |
| forgot | `PULIHKAN AKUN` | `Atur ulang kata sandi.` | `Kami akan mengirim kode reset jika email terdaftar.` |
| reset | `PULIHKAN AKUN` | `Buat kata sandi baru.` | — |

**Field:** `Email` · `Kata sandi` (placeholder `Min. 10 karakter + angka`, tombol mata) · link `Lupa kata sandi?`. Tombol submit: `Masuk admin`.

**Pesan error yang mungkin muncul:** `Akun ini belum terdaftar sebagai admin.` · `Sistem akun sedang tidak tersedia. Silakan coba kembali beberapa saat lagi.` · `Autentikasi gagal.`

Wordmark di halaman ini ditulis `TAP` diikuti label kecil `Panel internal`.

> **Prompt Stitch**
>
> Buat halaman login khusus administrator untuk platform affiliate **TAP by Haluan**. Tema terang, latar putih, aksen pink `#d81280`, judul font Archivo. Nada lebih sunyi dan internal dibanding halaman daftar publik — tanpa materi pemasaran.
>
> Layout terpusat satu kolom dengan lebar maksimum 420px. Di atas kartu ada logo "TAP" dengan label kecil abu di sampingnya bertuliskan "Panel internal".
>
> **Kartu putih** dengan radius 24px, garis tepi tipis, dan bayangan halus, berisi:
> - Label kecil huruf kapital ber-spasi longgar "MASUK ADMIN"
> - Judul "Masuk ke panel admin."
> - Kalimat abu "Gunakan email yang sudah terdaftar di allowlist admin."
> - Field "Email" dengan placeholder "nama@email.com"
> - Field "Kata sandi" dengan placeholder "Min. 10 karakter + angka" dan tombol ikon mata di ujung kanan field
> - Link teks kecil rata kanan "Lupa kata sandi?"
> - Tombol pink lebar penuh "Masuk admin ↗"
>
> **Tanpa tab Daftar/Masuk dan tanpa tombol login Google.**
>
> Di bawah kartu, teks abu sangat kecil: "Akses admin diberikan lewat allowlist. Hubungi tim operasional Haluan jika akunmu belum terdaftar."

---

## 6. Lampiran

### 6.1 Enum & label

**SampleRequestStatus** — 6 nilai:

| Enum | Label UI |
|---|---|
| `PENDING` | Diajukan |
| `APPROVED` | Disetujui |
| `SHIPPED` | Dikirim |
| `COMPLETED` | Selesai |
| `REJECTED` | Ditolak |
| `CANCELLED` | Dibatalkan |

Empat pertama membentuk stepper. Dua terakhir adalah cabang, bukan titik di garis.

**MembershipStatus** — 4 nilai:

| Enum | Label admin | Label creator |
|---|---|---|
| `PENDING` | Pending | Menunggu verifikasi MCN |
| `VERIFIED` | Terverifikasi | MCN terverifikasi |
| `REJECTED` | Ditolak | Verifikasi perlu diperbaiki |
| `SUSPENDED` | Ditangguhkan | Akun ditangguhkan |

**CampaignStatus** — `ACTIVE` → Aktif · `ENDED` → Berakhir · `HIDDEN` → Disembunyikan

**CampaignHotBadge** — `TOP_BRAND` → Brand pilihan · `TRENDING` → Trending · `HIGH_CONVERSION` → Tinggi konversi · `HIGH_DEMAND` → Banyak peminat

**NotificationType** — `SAMPLE_STATUS_CHANGED` · `SAMPLE_REQUEST_NEW` · `PROFILE_VERIFIED` · `PROFILE_REJECTED` · `CAMPAIGN_NEW` · `CAMPAIGN_ENDING_SOON`

**Platform** — `TIKTOK_SHOP` → TikTok Shop · `SHOPEE_AFFILIATE` → Shopee Affiliate (di tabel admin disingkat "Shopee")

**CommissionType** — `PERSENTASE` (TikTok, rate wajib ada) · `KETENTUAN_PLATFORM` (Shopee, rate wajib null)

**UserRole** — `CREATOR` · `ADMIN` (Administrator terverifikasi) · `SUPER_ADMIN` (Super Admin terverifikasi)

### 6.2 Kategori brand

Tujuh kategori, hasil normalisasi di [lib/catalog.ts](lib/catalog.ts):

`Beauty & Health` · `Fashion` · `Food & FMCG` · `Home & Living` · `Tech` · `Mom & Baby` · `Lainnya`

### 6.3 Angka nyata untuk mock data

Dari snapshot audit 16 Agustus 2026 ([PRODUCT-AND-CONTENT.md](PRODUCT-AND-CONTENT.md)). Pakai angka ini alih-alih angka karangan Stitch:

| Metrik | Nilai |
|---|---|
| Baris data di sumber | 508 |
| Baris punya TAP link | 464 |
| Nama brand unik di sumber mentah | 421 |
| Baris bisa dibandingkan open-plan vs creator | 402 |
| Baris dengan delta positif | 336 |
| Rata-rata delta positif | +2,56% |
| Brand di katalog publik setelah dedup | ~320 |

Nama brand yang aman dipakai sebagai contoh (semuanya brand nyata di kategori kecantikan Indonesia): MS Glow, Somethinc, Scarlett Whitening, Wardah, Emina, Avoskin.

Format angka: gaya Indonesia dengan titik pemisah ribuan (`18.420`) dan koma desimal (`1,7%`). Tanggal: `20/08/2026 09.12` untuk timestamp admin, `20 Agu 2026` untuk tanggal ringkas.

### 6.4 Ambang Hot Deals

Dari [lib/hot-deals-config.ts](lib/hot-deals-config.ts). Relevan untuk prototype karena menjelaskan kenapa rail Hot Deals bisa kosong:

| Badge | Syarat |
|---|---|
| Brand pilihan | Admin menandai brand sebagai `featured` |
| Trending | ≥20 klik dalam 7 hari **dan** masuk desil teratas |
| Tinggi konversi | ≥20 klik dalam 30 hari **dan** rate ≥ 1,5× rate rata-rata situs (minimum 5%) |
| Banyak peminat | jumlah simpanan + request sample 30 hari ≥ 5 |

Satu badge per campaign, urutan prioritas seperti tabel di atas. Tidak pernah ditumpuk. Maksimal 8 campaign tampil.

### 6.5 Breakpoint & ukuran

| | Nilai |
|---|---|
| Breakpoint teruji | 320 · 375 · 768 · 1024 · 1440 |
| Lebar konten | 1180px |
| Tinggi header publik | 64px |
| Lebar sidebar (creator & admin) | ~240px |
| Grid katalog mobile | 2 kolom |
| Grid katalog desktop | 4 kolom |
| Kartu per halaman katalog | 24 |
| Baris per halaman tabel admin | 50 (sample: 20, notifikasi: 30) |

### 6.6 Yang sengaja tidak ada

Jangan menambahkan elemen berikut ke prototype, karena tidak ada di sistem dan akan menyesatkan:

- Tombol login Google (sudah dibangun, sengaja disembunyikan sampai credential production siap).
- Halaman atau widget "Product of the Week" berisi angka — modul intelligence-nya belum tersambung ke FastMoss/Kalodata.
- Angka rate atau estimasi komisi apa pun di kartu Shopee.
- Grafik pendapatan atau proyeksi komisi creator — TAP tidak memegang data transaksi, hanya klik dan request.
- Chat, komentar, atau leaderboard antar creator.
