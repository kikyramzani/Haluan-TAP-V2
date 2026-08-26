# TAP Redesign — Audit Report

Redesign visual, penggantian sumber data, perubahan aturan komisi, dan CMS admin.
Angka di dokumen ini berasal dari workbook `Haluan Digital Agency Internal
(Agustus 2026).xlsx` dan dari suite yang dijalankan pada commit ini.

---

## 1. BEFORE — audit website lama

Website lama **bukan** sekadar daftar link. Ia sudah punya 319 brand TikTok,
383 campaign Shopee, pencarian ⌘K, filter kategori, sorting, modal link dengan
focus trap, halaman brand, auth, request sample, dan admin workspace. Jadi yang
dikerjakan adalah perombakan, bukan pembangunan dari nol.

| Area | Masalah | Severity | Tindakan |
| --- | --- | --- | --- |
| Visual | Gelap + neon (`#25e0e7`, `#eb0a8c`, `#6359fc`). Jauh dari arah Apple-inspired | High | Token ditulis ulang, terang jadi bawaan |
| Arsitektur CSS | Satu berkas 320 baris/54 KB, tumbuh seperti changelog, deklarasi ganda, tema terang dideklarasikan dua kali, delapan blok `@media(max-width:600px)` terpisah | High | Dipecah jadi 9 berkas bertoken |
| Komponen | Tidak ada direktori `components/`. Kartu deal disalin di dua tempat dan sudah berbeda (`<h3>` vs `<h2>`); focus trap juga disalin | High | Diekstrak jadi satu implementasi |
| Data | Komisi memakai penawaran **terbaik** per brand, lalu brand dengan delta ≤ 0 dibuang diam-diam | High | Diganti aturan nilai terkecil |
| Data | 31 baris di 20 brand ditolak parser karena ambigu (`11,12,13%`, `11/12%`, `10% (2.0)`, `12`) | Medium | 28 di antaranya kini terbaca |
| Konsistensi | `/api/campaigns` dan halaman server memakai resolver sumber berbeda dengan env var berbeda; konfigurasi separuh membuat salah satunya mati | Medium | Ditambah fallback, perilakunya disamakan |
| Performa | Jalur Redis memakai `cache: "no-store"`, jadi CSV penuh diparse ulang tiap request | Medium | Belum diperbaiki — lihat bagian 8 |
| Robustness | `/api/campaigns/[id]/links` memanggil rate limiter di luar `try`, sehingga Redis bermasalah = HTTP 500 | Medium | Dibuat fail-open seperti katalog |
| Urutan | Campaign kedaluwarsa hanya turun ke bawah setelah user menyentuh kontrol; render server menaruhnya di atas | Medium | Aturan dipindah ke pengurutan server |

### Audit kompetitor — affiliateakademi.id/komisi-extra

Halaman kompetitor dirender penuh di klien, jadi isinya tidak terbaca tanpa
JavaScript. Yang bisa dipastikan: filter kategori, filter brand, pemilihan
platform, sorting "Komisi Terbesar", tombol reset, dan CTA "Daftar Sekarang".

| Aspek | Affiliate Akademi | TAP sesudah redesign |
| --- | --- | --- |
| Penemuan | Dropdown kategori + brand | Pencarian realtime, chip kategori, band komisi, filter sample |
| Komisi | Sorting "komisi terbesar" | Nilai **terkecil** per brand, jujur soal lantai |
| Sample | Tidak terlihat | Badge, filter, dan status per brand |
| Isi halaman | Perlu JS untuk melihat apa pun | Dirender server, terbaca tanpa JS |
| Angka tidak terbaca | Tidak diketahui | Ditampilkan `—`, tidak ditebak |

Yang sengaja **tidak** ditiru: sorting yang menonjolkan komisi terbesar. Itu
membuat angka di kartu jadi janji yang lebih besar daripada yang diterima creator.

---

## 2. AFTER — perubahan UI/UX

**Arah:** terang, tipografi besar, whitespace lega, border tipis, bayangan
sangat halus. Gelap dipertahankan sebagai pilihan, bukan sebagai pembalikan
warna — kontras dan kekuatan aksennya ditulis terpisah.

**Sistem token** (`app/styles/tokens.css`): skala jarak 4→128, radius
8/12/16/20/24 dengan pil hanya untuk badge dan chip, durasi 150/250/350 ms,
easing `cubic-bezier(0.16, 1, 0.3, 1)`. Animasi hanya `transform`, `opacity`,
`filter`.

**Kartu brand.** Komisi jadi elemen terbesar (42px display) karena itu yang
paling dicari creator. Label ditumpuk di bawah angka supaya panjang label tidak
pernah mengubah tinggi baris. Kartu meregang setinggi barisnya sehingga deretan
CTA sejajar.

**Detail campaign.** Drawer kanan di desktop, lembar penuh dari bawah di mobile,
dengan komponen dan focus trap yang sama. Tiap campaign punya barisnya sendiri
lengkap dengan komisinya, jadi creator tidak perlu kembali ke katalog untuk
berpindah campaign.

**Komponen baru** di `app/components/`: `BrandCard`, `CampaignSheet`,
`CampaignCatalog`, `BrandMark`, `SiteHeader`, `SiteFooter`, dan hook
`useFocusTrap`. Beranda dan `/deals` kini memakai satu implementasi kartu.

---

## 3. DATA — bagaimana spreadsheet diproses

```
List Campaign (All TAP)          GMV Campaign Brand
        │                                │
   materialisasi hyperlink          kolom F + kolom J
        │                                │
   sync-campaign-links            sync-brand-metrics
        │                                │
        └──────────► Redis privat ◄──────┘
                          │
              buildCampaignCatalog(csv, resolveMetric)
                          │
                 override CMS admin
                          │
                     UI / API publik
```

**Temuan yang mengoreksi brief.** "Sample Support" bukan baris di dalam GMV
Campaign. Itu **kolom F di worksheet lain** (`GMV Campaign Brand`), berisi
boolean 0/1. `GMV TAP` adalah kolom J di worksheet yang sama. Keduanya perlu
penggabungan lintas sheet berdasarkan nama brand.

**Blocker yang ditemukan dan diselesaikan.** Di kolom `TAP LINK`, teks selnya
kosong untuk seluruh 481 baris — URL-nya hanya ada sebagai hyperlink OOXML.
Ekspor CSV menghasilkan kolom kosong. Prosedurnya ada di
[SHEET-SYNC-RUNBOOK.md](SHEET-SYNC-RUNBOOK.md), dan
`scripts/sync-campaign-links.mjs` sekarang menolak feed semacam itu dengan pesan
yang menyebut langkah perbaikannya.

**Hasil terhadap workbook asli:**

| Metrik | Nilai |
| --- | --- |
| Baris campaign diproses | 481 |
| Brand tayang | 396 |
| Brand dengan komisi terbaca | 391 |
| Brand dengan komisi `—` | 5 |
| Sample support diketahui | 271 dari 396 (68%) |
| Brand tercocokkan ke peringkat GMV | 190 |
| Sel ditolak parser | 7 sel di 4 brand |

**Penggabungan nama brand.** Sheet metrik memakai handle toko, bukan nama brand
(`glad2glow.indo`, `Skintificid`, `usmile Indonesia Official Shop`). Kuncinya
dibentuk dengan membuang sufiks berlapis lalu dicocokkan persis; bila gagal,
awalan dipakai sebagai cadangan **hanya bila hasilnya tunggal**. Begitu ada dua
kandidat, brand dianggap tidak cocok daripada salah tempel.

**GMV tidak pernah ditampilkan.** Sesuai keputusan, nilai rupiahnya dibuang di
`lib/brand-metrics.ts` dan yang diekspor hanya peringkat relatif. Ada test yang
menjaga ini: `angka GMV internal tidak pernah keluar ke permukaan publik`
memeriksa response API dan HTML kedua halaman publik.

---

## 4. LOGIC — komisi terkecil per brand

```
brandCommission = MIN(komisi seluruh campaign milik brand tersebut)
```

Parser (`lib/commission.ts`) menangani dua encoding yang hidup di kolom yang
sama: **sel numerik adalah pecahan** (`0.09` = 9%), **sel teks membawa persen**
(`9-10%`). Urutan aturannya:

1. Ada `%` → angka dibaca apa adanya
2. Desimal telanjang < 1 → pecahan, dikali 100
3. Bilangan bulat telanjang → sudah persen (`12` → 12%)
4. Penanda versi dan kualifikasi dibuang (`11% 2.0`, `10% (khusus top)`)
5. Rentang memakai batas **bawah** (`9-10%` → 9%)
6. Daftar tier memakai nilai terkecil (`10,11,12%` → 10%)
7. Sisanya ditolak, tidak ditebak

Ditolak secara sengaja: `10-1%` (rentang menurun, hampir pasti salah ketik
`10-11%`), `8,10` (satu koma dua digit — genuinely ambigu), dan teks non-angka
dari kolom yang bergeser. `7,5%` tetap terbaca sebagai desimal Indonesia.

**Dampak terukur** terhadap sheet produksi lama (508 baris):

| | Aturan lama | Aturan baru |
| --- | --- | --- |
| Brand tayang | 322 | 320 |
| Brand yang angkanya berubah | — | 32 dari 386 |

Katalognya hampir tidak menyusut. Sebagai efek samping, aturan ini
**menyelesaikan** 28 dari 31 baris yang dulu ditolak: pertanyaan "rate-nya
berapa" memang ambigu untuk `11,12,13%`, tapi "paling kecil berapa" tidak.
Ini menutup board item **C2**.

**Konsekuensi yang perlu diketahui.** Menghapus `delta` berarti menghapus juga
gerbang `filter(delta > 0)` — kalau tidak, brand hilang karena metrik yang sudah
tidak ditampilkan. Copy di proof bar, hero, penjelas rate, opsi sorting "Extra
terbesar", pill `+N poin`, dan satu FAQ ikut ditulis ulang, bukan sekadar
disembunyikan.

---

## 5. CMS ADMIN — lapisan override

Spreadsheet tetap sumber massal. Admin tidak menulis balik ke sheet;
suntingannya disimpan terpisah dan ditempelkan saat render.

```
sheet → metrik brand → override admin → UI
```

Sinkronisasi ulang tidak pernah menghapus suntingan admin, dan sebaliknya sebuah
override tidak menyembunyikan bahwa sheet-nya masih salah — tabel admin
menampilkan nilai sheet di sampingnya.

Yang bisa diubah: komisi per campaign, TAP link, kategori, nama tampil, logo
(unggah, maks 100 KB), status sample, sembunyikan brand, tandai berakhir,
gabungkan brand duplikat, dan tambah campaign yang belum ada di sheet.

Ada juga antrean baris yang ditolak parser, supaya ops tahu persis sel mana yang
perlu dirapikan di spreadsheet.

Rute `/api/admin/catalog` memakai primitif yang sudah ada: `getAdminUser()`,
`sameOrigin()`, `recordAudit()`, `bumpCollectionRevision()`. Setiap perubahan
katalog meninggalkan jejak audit (`catalog.override.save`,
`catalog.override.revert`). TAP link hanya diterima bila HTTPS.

---

## 6. RESPONSIVE

Disapu otomatis pada **320, 375, 390, 414, 768, 1024, 1280, 1440, 1920** ×
6 halaman × 2 tema = **108 kombinasi, 0 overflow horizontal**.

Dua bug nyata ditemukan dan diperbaiki dalam proses:

- Jalur grid `.catalog-controls` melebar mengikuti lebar alami deretan chip
  (jebakan `min-width: auto`), membuat `/deals` bisa digeser ke samping sampai
  1018px di viewport 390px.
- `.nav-actions` tidak muat di 390px; tautan sesi kini disembunyikan di layar
  sempit karena "Akun" sudah ada di navigasi bawah.

Mobile: satu kolom, sorting pindah ke barisnya sendiri, detail jadi lembar penuh
dari bawah, navigasi bawah tetap, target sentuh ≥ 40px pada CTA kartu dan ≥ 44px
pada kontrol utama.

---

## 7. PERFORMANCE & ACCESSIBILITY

**Performa** (build produksi lokal, 1440px):

| Halaman | TTFB | FCP | CLS |
| --- | --- | --- | --- |
| `/` | 101 ms | 420 ms | 0.002 |
| `/deals` | 59 ms | 200 ms | 0.009 |

CSS terkirim **9,5 KB gzip** (budget landing page < 30 KB). Tidak ada dependency
runtime baru — aplikasi tetap hanya `next`, `react`, `react-dom`. `npm audit`:
0 kerentanan.

**Aksesibilitas**: axe-core pada 7 rute × 2 tema — **0 pelanggaran
critical/serious**. Perjalanan keyboard pada drawer terverifikasi: fokus masuk,
Tab terkurung, Escape menutup, fokus kembali ke tombol pemicu.

Tiga masalah kontras nyata ditemukan dan diperbaiki, semuanya berasal dari token
yang saya pilih sendiri:

- `--text-subtle` di tema terang hanya 3,39:1 → dinaikkan ke 4,94:1
- `.chip-count` memakai `opacity: 0.6` → 2,52:1; dibedakan lewat ketebalan huruf
- Kartu kedaluwarsa memakai `opacity: 0.62`, menjatuhkan seluruh teks di dalamnya
  ke 2,41:1 → diganti permukaan redup + border putus-putus

**Suite**: 85 unit/contract, 159 E2E, semuanya lulus, 0 skipped.
`release-gate-baseline.json` sudah diperbarui ke angka tersebut.

---

## 8. REMAINING ISSUES

1. **Repositori ini bukan git repo.** Pekerjaan ini harus direkonsiliasi dengan
   repo sebenarnya sebelum apa pun dikirim. Ingat R19-01: `main` tertinggal 15
   commit dan production branch Vercel adalah `main`; push ke sana akan
   me-rollback 21 commit hardening.
2. **CMS belum bisa dipakai sampai R19-02 selesai** — saat ini tidak ada admin
   yang berfungsi.
3. **Langkah Apps Script adalah prasyarat keras.** Tanpa kolom `TAP LINK URL`
   yang dimaterialisasi, katalog mengimpor nol campaign.
4. **Workbook bisa diunduh publik tanpa login.** Memuat GMV internal, nama PIC,
   dan sheet operasional lain. Perlu dibatasi di Drive.
5. **Cakupan sample support 68%.** Ejaan brand di dua sheet berbeda; sisanya
   tampil "belum diketahui", bukan "tidak tersedia". Pemetaan manual dilakukan
   lewat CMS.
6. **Jalur Redis masih tanpa cache** (`lib/redis.ts`), jadi CSV diparse ulang
   tiap request. Belum saya sentuh karena menyentuh jalur data seluruh aplikasi
   dan pantas jadi perubahan tersendiri dengan pengukurannya sendiri.
7. **7 sel di 4 brand** masih perlu dirapikan ops — `Kahf(Paragon)`, `Dorskin`,
   `sunsilk`, `CRUSITA`. Terlihat di `npm run audit:rates` dan di CMS.
8. **Halaman auth/dashboard/admin ditata ulang, bukan ditulis ulang.** Markup dan
   logikanya dipertahankan karena menyimpan alur auth yang teruji; hanya lapisan
   visualnya yang diganti.

---

## 9. NEXT IMPROVEMENTS

1. **Cache katalog terhadap revision counter.** Pola untuk ini sudah ada di
   `lib/filter-cache.ts`. Ini perbaikan performa terbesar yang tersisa.
2. **Sinkronisasi terjadwal.** Saat ini refresh katalog sepenuhnya manual. Satu
   cron Vercel dapat menjalankan ketiga script sync.
3. **Kamus alias brand di CMS**, supaya pemetaan lintas sheet tersimpan dan
   cakupan sample naik dari 68% tanpa menyentuh kode.
4. **Logo brand**: cakupan lokal masih 64% (target board > 85%). Unggah lewat CMS
   sekarang menutup kekurangan itu per brand tanpa deploy.
5. **Virtualisasi daftar** bila katalog melewati ~1.000 brand. Di 396 brand,
   progressive loading 24 per batch sudah memadai.
6. **JSON-LD `ItemList`** pada `/deals` untuk hasil pencarian yang lebih kaya.
