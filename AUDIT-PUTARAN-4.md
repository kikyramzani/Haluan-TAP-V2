# TAP by Haluan — QC/QA Depth Review, Putaran 4

**Commit:** `087ade4` · **Tanggal:** 16 Agustus 2026
**Skor audit: 8,1/10** (5,5 → 6,9 → 7,6 → **8,1**)

Semua temuan diverifikasi ulang dari nol: `npm run qa` dijalankan **lima kali berturut-turut**, audit sumber rate terhadap sheet live, pengukuran DOM di Pixel 7, uji katalog saat Redis dimatikan, dan pembacaan HTML server. Bukan dari membaca commit message.

---

## Ringkasan

Gate deterministik yang saya minta di putaran 3 sekarang terpenuhi: **lima dari lima `npm run qa` hijau, masing-masing 36/36 E2E**. Enam dari tujuh temuan putaran 3 tertutup, dan dua di antaranya sekarang punya regression test sendiri.

Yang tersisa bukan lagi masalah keandalan, melainkan tiga pekerjaan yang belum pernah disentuh selama empat putaran: verifikasi email dan reset password, pagination data pribadi di admin, dan pengerasan CSP. Ditambah satu bug tampilan baru yang lahir dari pemadatan homepage.

---

## Temuan putaran 3: enam dari tujuh tertutup

| ID | Temuan | Status | Bukti verifikasi |
|---|---|---|---|
| T1 | Quality gate flaky | **Tutup** | `npm run qa` 5× berturut-turut exit 0, masing-masing 36 tes lolos. `.theme-toggle` kini `position:fixed`, `z-index:400`, dan `elementFromPoint` mengembalikan tombolnya sendiri. Media kartu diberi `pointer-events:none` |
| T2 | Katalog mati saat Redis mati | **Tutup** | Mock Redis dimatikan lewat `__redis-down` → `/api/campaigns` tetap **200**. Rate limiter dibungkus `try/catch` sendiri; auth dan write tetap fail-closed. Sudah ada regression test di E2E |
| T3 | Pemilih campaign menerima teks bebas | **Tutup** | State terstruktur menggantikan string gabungan; submit diblokir dengan pesan inline yang terhubung `aria-describedby`. E2E menguji kasus "Skintific" persis |
| T4 | Kartu pertama homepage di balik nav | **Tutup** | Diukur di Pixel 7: kartu pertama di **652px**, area terlihat berhenti di 775px → **123px kartu tampak**. E2E kini menguji `viewport - 64`, bukan viewport penuh |
| T5 | Separuh katalog tanpa logo | **Separuh** | Tiga aset dipakai (Mistine, Laneige, Anua). Cakupan bergerak dari 48% ke **49%** di TikTok; Shopee tetap **56%** |
| T6 | `revalidate` yang tidak berlaku | **Tutup** | Deklarasi dihapus dari `app/deals/page.tsx` |
| F20 | Teks outline di desktop | **Tutup** | `-webkit-text-stroke:0` dengan warna cyan solid, berlaku di semua breakpoint |

---

## Empat temuan baru

### U1 · P2 — Judul homepage kehilangan spasi di mobile

Pemadatan above-the-fold menyembunyikan `<br>` di dalam heading, tetapi tidak menambahkan spasi penggantinya. Markup-nya `Deal yang benar-benar<br/><em>lebih tinggi.</em>`, dan CSS-nya `#deals .deal-heading h2 br{display:none}`.

Hasilnya di layar mobile: **"Deal yang benar-benarlebih tinggi."** — terbaca menyatu. Terkonfirmasi di HTML server dan di screenshot Pixel 7. Ini judul section utama di halaman paling banyak dilihat.

**Target fix.** Ganti `<br/>` dengan spasi eksplisit di JSX, atau beri `br{display:inline}` dengan `content:" "`. Sekalian tambahkan satu assertion E2E untuk teks judul yang ter-render, karena bug seperti ini tidak akan pernah tertangkap oleh tes layout.

### U2 · P3 — Tiga aset logo menganggur di repo

`public/brand-media/makarizo.jpg` ada di repo tetapi tidak dirujuk sama sekali dari `app/brand-assets.ts`, sementara Makarizo tampil sebagai kotak inisial di katalog. `advan.jpg` dan `somethinc.jpg` hanya terpasang sebagai cover, bukan logo, sehingga kedua brand itu juga tampil berinisial.

**Target fix.** Tiga baris tambahan di `BRAND_MEDIA`. Gratis, langsung menaikkan cakupan.

### U3 · P3 — Lima nama brand Shopee belum bersih

Dari 383 record: `realme Authorized Store Tangerang` (nama toko reseller, bukan brand), `SKIN1004 New` (sufiks "New" belum dipangkas), `Loreal Profesionnel Indonesia` (salah eja, seharusnya "Professionnel"), ditambah `3CE` dan `2R & Memey Cosmetic` yang perlu dikonfirmasi ejaannya. Semua tampil apa adanya ke creator.

**Target fix.** Tambahkan aturan di `cleanShopeeBrand` untuk sufiks toko/reseller, dan masukkan tiga nama itu ke tabel alias.

### U4 · P3 — Dokumen audit 128 KB ikut masuk repo

`AUDIT-PUTARAN-3.html` (128 KB, sebagian besar font base64) sekarang ter-commit. File itu tidak dilayani karena berada di root, bukan di `public/`, jadi tidak ada dampak runtime. Tapi ia ikut ke setiap clone dan setiap build context.

**Target fix.** Simpan versi `.md` saja di repo, dan taruh `.html` di tempat berbagi dokumen. Atau tambahkan `AUDIT-*.html` ke `.gitignore`.

---

## Yang belum tersentuh selama empat putaran

| ID | Temuan | Bukti |
|---|---|---|
| F10 | Tanpa verifikasi email dan reset password | "Lupa kata sandi?" masih `mailto:`; registrasi tidak memverifikasi kepemilikan email |
| F15 | Admin memuat seluruh PII creator ke browser | `listUsers(1000)` dan `listSampleRequests(5000)` mengirim alamat, nomor HP, dan email lengkap, lalu di-`slice(0,100)` hanya untuk ditampilkan |
| F27 | CSP memakai `script-src 'unsafe-inline'` | `next.config.ts` tidak berubah sejak `8269a9e` — empat putaran |
| F31 | Kepastian intake sample Shopee | 284 dari 383 brand ditandai "Sample tersedia" sementara sheet punya kolom Google Form sebagai jalur asli. Menunggu konfirmasi ops, bukan pekerjaan kode |

Ketiga yang pertama semuanya menyangkut keamanan dan privasi. Itulah sebabnya skor Security & privacy tidak bergerak sejak putaran 2.

---

## Skor

| Area | P1 | P2 | P3 | Sekarang | Yang menentukan |
|---|---:|---:|---:|---:|---|
| Automated QA | 6 | 9 | 6 | **9,5** | 5/5 run hijau, 36 tes, regression test untuk T2 dan T3 |
| SEO & discovery | 2 | 6 | 9 | **9** | Katalog di HTML server, sitemap 699 URL, halaman brand berangka |
| Mobile discovery | 6 | 8 | 8,5 | **9** | 123px kartu pertama tampak di atas navigasi bawah |
| Performance | — | 5 | 8 | **8,5** | TTFB 6–27 ms, HTML 12,5 KB gzip, tanpa fetch klien di homepage |
| Conversion journey | 7 | 6,5 | 8 | **8,5** | Validasi campaign benar dan berpesan; Google login hidup |
| Product clarity | 7 | 8 | 8,5 | **8,5** | Judul homepage rusak menahan kenaikan |
| Data integrity | 3 | 7 | 8 | **8** | Tidak berubah: 310 record, 50 sel dikecualikan, 22 brand tidak tayang |
| Operational readiness | 6 | 7 | 8 | **8** | Tidak berubah; audit log terbaca, pagination admin belum |
| Security & privacy | 7 | 7,5 | 7,5 | **7,5** | Tidak berubah empat putaran: F10, F15, F27 |
| Visual identity | 7 | 6 | 6 | **6,5** | Outline desktop beres dan 3 logo ditambah; cakupan masih 49% |
| Trust & proof | 4 | 6 | 6 | **6** | Dokumen board jujur; bukti settlement belum ada |
| **Rata-rata** | **5,5** | **6,9** | **7,6** | **8,1** | Keandalan selesai; sisanya keamanan dan aset |

---

## Rencana ke 10/10

Sisa pekerjaannya sekitar lima hari kerja, dan dua di antaranya menentukan apakah closed beta boleh jalan.

### Gelombang A — prasyarat closed beta · 2–3 hari

- **F10** — verifikasi email saat registrasi dan reset password lewat alur kode yang sama. Selama ini belum ada, satu-satunya jalur masuk adalah password tanpa pemulihan mandiri, dan alamat email orang lain bisa dipakai mendaftar lalu ikut terkunci.
- **F15** — pagination dan pencarian di server untuk daftar creator dan request sample. Berhenti mengirim alamat rumah dan nomor HP seluruh creator ke browser hanya untuk menampilkan 100 baris.

### Gelombang B — pengerasan dan kebersihan · 1–2 hari

- **F27** — CSP dengan nonce lewat middleware; hapus `'unsafe-inline'` dari `script-src`.
- **U1** — perbaiki spasi judul homepage dan tambahkan satu assertion teks di E2E.
- **U2** — tiga baris `BRAND_MEDIA` untuk Makarizo, Advan, Somethinc.
- **U3** — bersihkan lima nama brand Shopee.
- **U4** — keluarkan `AUDIT-*.html` dari repo.

### Gelombang C — aset dan ops, bisa paralel

- **T5** — ±100 logo brand dari `BRAND-LOGO-GAPS.md`. Ini pekerjaan desain, bukan engineering, dan satu-satunya yang menahan skor Visual identity.
- **F31** — konfirmasi tertulis dari ops bahwa request sample Shopee lewat TAP sampai ke brand.
- Kolom tanggal berlaku di sheet, lalu aktifkan kembali tampilan validitas.
- 22 brand yang tidak tayang karena format rate: kirim ke ops dengan tenggat.

---

## Definisi 10/10

1. **Quality gate deterministik: lima kali `npm run qa` berturut-turut hijau.** — **terpenuhi di putaran ini.**
2. Setiap fitur yang bisa dimatikan lewat env punya satu e2e yang membuktikannya menyala saat env-nya terisi. — terpenuhi.
3. Kegagalan satu dependency tidak mematikan jalur yang tidak membutuhkannya. — terpenuhi.
4. Setiap rate yang tayang bisa ditelusuri ke satu sel sheet, dan setiap record yang tidak tayang punya pemilik serta tenggat perbaikan. — separuh: pelaporannya ada, pemilik dan tenggatnya belum.
5. Creator bisa mendaftar, **verifikasi**, **reset password**, dan melihat deal pertama tanpa menggulir di mobile. — belum: verifikasi dan reset belum ada.
6. Tidak ada data pribadi creator yang dikirim ke browser melebihi yang ditampilkan. — belum.
7. Tidak ada satu pun angka di UI yang tidak punya sumber, termasuk saat data gagal dimuat. — terpenuhi.

---

## Cara verifikasi dijalankan

- `npm run qa` dijalankan **5×** berturut-turut: exit 0 semua, 36 tes lolos per run (25–27 detik per run E2E).
- `npm run audit:rates` terhadap sheet live: 310 record terbit, 50 sel dikecualikan, 35 brand terdampak, 22 brand tidak tayang.
- `/api/campaigns` diuji dengan mock Redis dimatikan (`__redis-down`) → tetap HTTP 200.
- Cakupan logo dihitung langsung dari sumber katalog: TikTok 153/310, Shopee 216/383.
- Pengukuran DOM Pixel 7 (viewport 839px): kartu pertama homepage 652px, `/deals` 702px, navigasi bawah 64px.
- TTFB diukur 3× per halaman: `/` 12 ms, `/deals` 12–27 ms, `/deal/mistine` 6–17 ms.
- `/dashboard` diperiksa: `Cache-Control: private, no-cache, no-store` dan redirect ke login untuk pengunjung anonim.
