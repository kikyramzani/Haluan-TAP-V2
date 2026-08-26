# TAP by Haluan — QC/QA Depth Review, Putaran 3

**Commit:** `f92c1fe` · **Tanggal:** 16 Agustus 2026
**Skor audit: 7,6/10** (Putaran 1: 5,5 → Putaran 2: 6,9 → sekarang 7,6)

Semua temuan di bawah diverifikasi dengan menjalankan build, quality gate penuh dua kali, audit sumber rate terhadap sheet live, pengukuran DOM di Pixel 7, dan uji perilaku saat Redis dimatikan. Bukan dari membaca commit message.

---

## Ringkasan

Putaran ini berisi perbaikan struktural, bukan tambalan. Homepage dan `/deals` dipecah menjadi server component pembawa data dan client component pemegang interaksi. **Keenam regresi putaran 2 tertutup**, ditambah empat temuan lama.

Yang menahan skor: quality gate gagal pada run pertama dan lolos pada run kedua tanpa ada perubahan kode, katalog publik ikut mati saat Redis mati, dan separuh katalog masih tanpa logo karena perbaikannya berhenti di sisi kode.

---

## Enam temuan baru

### T1 · P0 — Quality gate sekarang flaky: merah lalu hijau tanpa ada yang berubah

`npm run qa` run pertama: **1 gagal, 33 lolos, exit 1**. Yang gagal `tests/e2e/public.spec.ts:22` pada mobile-chromium — klik pada tombol tema tidak pernah mendarat selama 30 detik karena logo kartu yang di-lazy-load menyerobot pointer event:

> `img alt="Glow Better logo" … subtree intercepts pointer events`

- Tes yang sama dijalankan sendirian: **3 dari 3 lolos**.
- `npm run test:e2e` penuh dijalankan ulang: **34 lolos, exit 0**.
- Bedanya: di `npm run qa`, `next build` jalan tepat sebelum e2e sehingga mesin masih sibuk dan gambar mendarat terlambat. CI melakukan urutan yang sama persis.

Penyebab strukturalnya nyata: sejak katalog di-render server, kartu langsung terlukis di area yang sama dengan `.theme-toggle` yang di mobile memakai `position:absolute`. Kontrol dan konten berebut ruang yang sama, dan pemenangnya tergantung urutan muat.

**Target fix.** Jadikan tombol tema `position:fixed` di mobile dengan stacking context sendiri, dan beri kartu tinggi tetap supaya gambar tidak menggeser layout saat mendarat. Gate yang kadang hijau lebih berbahaya daripada gate yang merah — tim akan belajar me-retry, bukan memperbaiki.

### T2 · P1 — Katalog publik ikut mati ketika Redis mati, padahal datanya dari CSV

Rate limit yang ditambahkan pada putaran 2 memanggil Redis di baris pertama `GET /api/campaigns`. Ketika Redis tidak tersedia, panggilan itu melempar dan tertangkap oleh `catch` terluar, sehingga endpoint mengembalikan 503 dengan katalog kosong.

- Diuji langsung: Redis dimatikan → `/api/campaigns` **503**. Redis dinyalakan → **200, 310 record**.
- Selama itu halaman `/` dan `/deals` tetap normal, karena keduanya memanggil `getCampaignCatalog` langsung tanpa lewat rate limiter.

Artinya saat Upstash bermasalah, situs setengah hidup: halaman jalan, tapi pergantian tab platform, halaman admin, dan seluruh konsumen API mati.

**Target fix.** Rate limiter untuk endpoint baca publik harus fail-open: bungkus `checkRateLimit` dengan `try/catch` sendiri dan lanjutkan melayani ketika penghitungnya tidak tersedia. Fail-closed tetap benar untuk login, register, dan request sample.

### T3 · P2 — Pemilih campaign baru menerima teks bebas, lalu memotong nama brand

`<select>` 312 opsi diganti `<input list=…>` — arah yang benar. Tapi datalist tidak membatasi isian, dan parser-nya memakai `lastIndexOf(" · ")` tanpa penjagaan.

Creator yang mengetik `Skintific` lalu menekan kirim mengirimkan brand `"Skintifi"` dan platform `"intific"`. API menolak dengan pesan generik "Lengkapi seluruh data request dengan benar", setelah seluruh formulir terisi.

**Target fix.** Simpan pilihan sebagai state terstruktur, bukan string gabungan. Blokir submit selama nilainya tidak cocok dengan salah satu opsi, dan katakan alasannya di dekat field.

### T4 · P2 — Kartu pertama homepage tepat berada di balik navigasi bawah

Pemadatan above-the-fold berhasil menurunkan posisi kartu pertama dari 1.963px ke **812px**. Tapi viewport Pixel 7 adalah 839px dan 64px terakhirnya ditutup `.mobile-bottom-nav` yang `position:fixed`. Area terlihat berhenti di 775px, jadi kartu pertama praktis belum kelihatan.

`/deals` sudah benar: kartu pertama di 702px, aman di atas navigasi.

**Target fix.** Kurangi ±80px lagi dari blok antara hero dan grid — heading "Deal yang benar-benar lebih tinggi" di mobile bisa jadi satu baris, dan baris hasil bisa digabung ke toolbar.

### T5 · P2 — Perbaikan logo ditutup di sisi kode, bukan di sisi yang dilihat creator

`BRAND_DOMAINS` dan pemanggilan no-op-nya sudah dihapus — 104 baris hilang dari bundle, benar. Tapi aset penggantinya belum ada: `public/brand-logos` tetap berisi **318 file**, dan cakupan logo tidak bergerak sama sekali.

- TikTok: **150 dari 310 (48%)**. Shopee: **214 dari 383 (56%)**.
- Masih kotak inisial: Mistine, Laneige, Anua, Azarine, AXIS-Y, Amaterasun, Emina, Advan, Anker, MINISO.

**Target fix.** Ini pekerjaan aset, bukan pekerjaan kode: ±100 logo brand dari `BRAND-LOGO-GAPS.md`. Sampai itu selesai, jangan hitung temuan ini sebagai tertutup.

### T6 · P3 — `revalidate` pada `/deals` tidak berpengaruh apa-apa

`app/deals/page.tsx` mendeklarasikan `export const revalidate = 300`, tetapi halaman itu membaca `searchParams` sehingga selalu dinamis. Output build mengonfirmasinya: `ƒ /deals`, bukan `○` dengan revalidate seperti `/sitemap.xml`.

Tidak berbahaya — TTFB terukur 8–11 ms karena fetch CSV-nya sudah di-cache dan parsing 900 baris memang murah. Tapi deklarasinya menyesatkan siapa pun yang membaca file itu nanti.

**Target fix.** Hapus deklarasinya, atau pindahkan pembacaan `platform` ke client sehingga halamannya benar-benar bisa di-cache.

---

## Regresi putaran 2: semuanya tertutup

| ID | Regresi | Status | Bukti verifikasi |
|---|---|---|---|
| R1 | 9 brand hilang tanpa pemilik | **Tutup** | CI menjalankan `audit:rates` non-blocking + artefak 30 hari + jadwal mingguan; admin menampilkan "50 sel pada 35 brand; 22 brand tidak tayang" |
| R2 | Tombol Google tidak bisa muncul | **Tutup** | `/daftar` jadi server component yang membaca env; HTML memuat `.google-button` |
| R3 | Separuh katalog kehilangan logo | **Separuh** | Kode mati dihapus; cakupan logo tetap 48% dan 56% — lihat T5 |
| R4 | 204 KB tanpa cache tiap kunjungan | **Tutup** | Homepage tidak fetch sama sekali; `/deals` memuat platform kedua saat tab ditekan; header kembali `public, s-maxage=300, swr=600`; HTML 12,5 KB gzip |
| R5 | 7 KB log per request | **Tutup** | Satu baris ringkasan dengan fingerprint; hanya dicetak saat himpunan brand bermasalah berubah |
| R6 | Bottom nav menimpa modal | **Tutup** | `.modal-backdrop` naik ke z-index 300; nav disembunyikan saat modal terbuka dan di area admin/dashboard |

---

## Temuan lama

| ID | Temuan | Status | Bukti verifikasi |
|---|---|---|---|
| F4 | Katalog nol untuk mesin pencari | **Tutup** | Nama brand ada di HTML server pada `/` dan `/deals`; sitemap 699 URL; halaman brand berangka |
| F14 | Audit tanpa pembaca | **Tutup** | Menu Audit Log baru, `/api/admin/audits`, tabel sebelum/sesudah; `membership.update` kini merekam `before` |
| F17 | Halaman publik tidak sadar sesi | **Tutup** | `PublicSessionLink` menampilkan nama creator dan tautan dashboard |
| F33 | Pemilih 312 opsi | **Separuh** | Diganti pencarian datalist, tapi menerima teks bebas — lihat T3 |
| F8b | Homepage dua layar sebelum deal | **Separuh** | 1.963px → 812px, tapi tertutup navigasi bawah — lihat T4 |
| F10 | Tanpa reset password dan verifikasi email | **Terbuka** | "Lupa kata sandi?" masih `mailto:` |
| F15 | Admin memuat seluruh PII | **Terbuka** | `listUsers(1000)` dan `listSampleRequests(5000)` tidak berubah |
| F20 | Teks outline di desktop | **Terbuka** | Override hanya di `@media(max-width:600px)` |
| F31 | Alur sample Shopee | **Terbuka** | Menunggu konfirmasi tim ops, bukan pekerjaan kode |

---

## Skor

| Area | P1 | P2 | Sekarang | Yang menentukan |
|---|---:|---:|---:|---|
| SEO & discovery | 2 | 6 | **9** | Katalog di HTML server, sitemap 699 URL, halaman brand berangka |
| Performance | — | 5 | **8** | 12,5 KB gzip, tanpa fetch klien di homepage, cache CDN kembali, TTFB 8–11 ms |
| Mobile discovery | 6 | 8 | **8,5** | Homepage dipadatkan; kartu pertama masih di balik navigasi bawah |
| Conversion journey | 7 | 6,5 | **8** | Google login hidup, nav sadar sesi, pemilih sample dicari; teks bebas belum dijaga |
| Data integrity | 3 | 7 | **8** | Banner admin, laporan CI, jadwal mingguan; 22 brand masih tidak tayang |
| Operational readiness | 6 | 7 | **8** | Audit log terbaca dengan sebelum/sesudah; pagination admin belum ada |
| Product clarity | 7 | 8 | **8,5** | State unverified jujur, halaman brand lengkap; rate masih tampil ganda |
| Security & privacy | 7 | 7,5 | **7,5** | Tidak ada perubahan; PII admin dan reset password tetap terbuka |
| Trust & proof | 4 | 6 | **6** | Dokumen board jujur; bukti settlement belum ada |
| Visual identity | 7 | 6 | **6** | Cakupan logo tidak bergerak: 48% dan 56% |
| Automated QA | 6 | 9 | **6** | Gate merah pada run pertama, hijau pada run kedua; non-deterministik |
| **Rata-rata** | **5,5** | **6,9** | **7,6** | Kenaikan terbesar di distribusi; tertahan gate yang tidak bisa dipercaya |

---

## Rencana ke 10/10

Sisa pekerjaannya tinggal sekitar delapan hari kerja, dan setengah harinya menentukan apakah semua angka di atas bisa dipercaya.

### Gelombang A — kembalikan kepercayaan pada gate · ½–1 hari

- **T1** — tombol tema jadi `fixed` dengan stacking context sendiri; kartu diberi tinggi tetap supaya gambar tidak menggeser layout. Lalu jalankan `npm run qa` lima kali berturut-turut dan pastikan lima-limanya hijau sebelum dianggap selesai.
- **T2** — rate limiter fail-open untuk endpoint baca publik; tetap fail-closed untuk login, register, dan request sample.
- **T3** — pemilih campaign memakai state terstruktur dan menolak nilai di luar daftar dengan pesan di dekat field.

### Gelombang B — tutup dua lubang operasional terakhir · 3–4 hari

- **F10** — verifikasi email saat registrasi dan reset password lewat alur kode yang sama. Ini satu-satunya sisa prasyarat closed beta.
- **F15** — pagination dan pencarian di server untuk daftar creator dan request sample; berhenti mengirim seluruh alamat dan nomor HP ke browser.
- **T5** — ±100 aset logo brand. Pekerjaan desain/ops, bisa jalan paralel.

### Gelombang C — rapikan sampai layak disebut sepuluh · 2–3 hari

- **T4** — kartu pertama homepage benar-benar terlihat di atas navigasi bawah.
- **T6** — bereskan deklarasi `revalidate` yang tidak berlaku.
- **F20** — teks outline di desktop diberi warna solid atau fallback.
- **F31** — konfirmasi tertulis dari ops soal intake sample Shopee.
- Halaman brand: hapus rate ganda, turunkan "Bagikan halaman TAP" ke bawah link yang ingin disalin.
- Tambahkan kolom tanggal berlaku di sheet, lalu aktifkan kembali tampilan validitas.

---

## Definisi 10/10

Tiga gate lama tetap, satu gate baru lahir dari putaran ini:

1. **Quality gate harus deterministik: lima kali `npm run qa` berturut-turut hijau.** Selama masih ada yang merah lalu hijau tanpa perubahan kode, semua angka lain kehilangan dasar.
2. Setiap fitur yang bisa dimatikan lewat env punya satu e2e yang membuktikannya menyala saat env-nya terisi.
3. Setiap rate yang tayang bisa ditelusuri ke satu sel sheet, dan setiap record yang tidak tayang punya pemilik serta tenggat perbaikan.
4. Kegagalan satu dependency tidak mematikan jalur yang tidak membutuhkannya.
5. Creator bisa mendaftar, verifikasi, reset password, dan melihat deal pertama tanpa menggulir di mobile.
6. Tidak ada satu pun angka di UI yang tidak punya sumber, termasuk saat data gagal dimuat.

---

## Cara verifikasi dijalankan

- `npm run qa` dijalankan 2× — run 1: 33 lolos, 1 gagal, exit 1; run 2: 34 lolos, exit 0.
- Tes yang gagal diulang sendirian 3× dan lolos semuanya.
- `npm run audit:rates` terhadap sheet live: 310 record terbit, 50 sel dikecualikan, 35 brand terdampak, 22 brand tidak tayang.
- `/api/campaigns` diuji dengan Redis mati dan hidup.
- Pengukuran DOM dan screenshot pada Pixel 7 (viewport 839px).
- Ukuran HTML diukur mentah dan ter-gzip.
