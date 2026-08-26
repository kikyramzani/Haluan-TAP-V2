# TAP by Haluan — QC/QA Depth Review, Putaran 5

**Commit:** `eb9e43b` · **Production:** https://haluan-tap.vercel.app · **Tanggal:** 16 Agustus 2026
**Skor audit: 7,4/10** (5,5 → 6,9 → 7,6 → 8,1 → **7,4**)

Ini putaran pertama dengan production yang bisa diuji langsung. Semua verifikasi dijalankan terhadap situs live dan repo: `npm run qa` lima kali berturut-turut, smoke production, header keamanan, DNS, canonical, TTFB, dan pembacaan kode jalur autentikasi baru.

---

## Ringkasan

**Kualitas engineering-nya naik, skornya turun.** Keduanya benar sekaligus, dan itu bukan kontradiksi.

Semua yang diklaim selesai memang selesai, dan saya verifikasi satu per satu di production: CSP memakai nonce per request tanpa `unsafe-inline`, admin tidak lagi mengirim PII yang tidak ditampilkan, judul mobile diperbaiki, nama brand Shopee dibersihkan, tiga logo terhubung, QA lima kali hijau dengan 38 E2E, smoke 8/8, nol kerentanan dependency. Nol console error di production dengan CSP seketat itu — bukti bahwa nonce-nya benar-benar bekerja, bukan sekadar terpasang.

Yang menurunkan skor ada di lapisan rilis dan konfigurasi, bukan di kode:

1. Perubahan login memblokir setiap akun lama, dan di production tidak ada jalan pulih.
2. Seluruh sitemap, canonical, dan gambar share menunjuk domain yang tidak ada.
3. Semua halaman dinamis dieksekusi di Washington DC untuk audiens Indonesia.

Board tidak menilai diff, board menilai yang tayang. Yang tayang sekarang punya satu P0 dan dua P1 yang tidak ada di putaran 4.

---

## Temuan baru

### V1 · P0 — Setiap akun lama terkunci dari login, tanpa jalan pulih

`app/api/auth/login/route.ts:15` menambahkan:

```
if (!user.emailVerifiedAt) return 403 "Verifikasi email kamu sebelum masuk."
```

`emailVerifiedAt` adalah field baru. Setiap user yang dibuat sebelum commit `eb9e43b` tidak memilikinya. Saya cari backfill di seluruh `lib/` dan `app/`, dan cari script migrasi di `scripts/` — **tidak ada.** Satu-satunya tempat field itu diisi adalah `createUser`, `verifyUserEmail`, `resetUserPassword`, dan `upsertGoogleUser`.

Akibatnya setiap creator credentials yang mendaftar sebelum deploy ini mendapat 403 permanen. Termasuk akun admin, kalau admin didaftarkan sebelum deploy — dan `OPERATIONS-RUNBOOK.md` langkah 1 memang "register the first admin".

Jalan pulihnya tertutup rapat:

- `POST /api/auth/verify/request` di production saya uji langsung: **503** `"Pemulihan akun belum tersedia. Hubungi tim Haluan."` — karena `RESEND_API_KEY` dan `EMAIL_FROM` belum ada.
- `app/daftar/AuthClient.tsx:56` hanya menangani `verificationRequired` untuk `mode === "register"`. Pada login, 403 jatuh ke cabang error generik: pesan tanpa tombol, tanpa langkah berikutnya.

Catatan rilis menyebut "pendaftaran lama tetap aktif agar creator tidak terputus". Itu benar untuk pendaftaran **baru**. Untuk akun yang sudah ada, blokirnya tidak bersyarat.

**Target fix (hari ini).**
1. Jadikan blokir login bersyarat: `if (authEmailEnabled() && !user.emailVerifiedAt)`. Selama email belum aktif, akun lama tetap bisa masuk.
2. Backfill `emailVerifiedAt` untuk seluruh user lama lewat script satu kali.
3. Tangani `verificationRequired` pada mode login di client: pindah ke layar verifikasi dan kirim ulang kode.
4. Tambahkan satu E2E: user tanpa `emailVerifiedAt` dengan email dimatikan tetap bisa login.

---

### V2 · P1 — Sitemap, canonical, dan gambar share menunjuk domain yang tidak ada

`tap.haluandigital.agency` **tidak resolve** — saya uji, `curl` gagal dengan "Could not resolve host". Tetapi production di `haluan-tap.vercel.app` menerbitkan:

| Permukaan | Isi | Akibat |
|---|---|---|
| `robots.txt` | `Sitemap: https://tap.haluandigital.agency/sitemap.xml` | Crawler diarahkan ke host mati |
| `sitemap.xml` | 699 URL, semuanya `tap.haluandigital.agency/...` | Seluruh sitemap tidak bisa diambil |
| `/deal/mistine` | `<link rel="canonical" href="https://tap.haluandigital.agency/deal/mistine">` | Google diminta mengindeks host yang tidak ada |
| Semua halaman | `og:image` → `https://tap.haluandigital.agency/og.png` | **Setiap preview share rusak** |

File yang sama di domain hidup mengembalikan 200 (`haluan-tap.vercel.app/og.png`).

Ini menghapus hasil kerja SEO putaran 3 dan 4 yang bernilai 9/10, dan merusak mekanik inti produk: tombol "Bagikan halaman TAP" menghasilkan preview tanpa gambar di WhatsApp dan Instagram.

**Target fix.** Set `NEXT_PUBLIC_SITE_URL=https://haluan-tap.vercel.app` sampai DNS `tap.haluandigital.agency` aktif, lalu pindahkan bersamaan dengan redirect 301 dari domain lama. Tambahkan satu smoke check: host di `canonical` harus resolve.

---

### V3 · P1 — Semua halaman dinamis dieksekusi di Washington DC

Header `x-vercel-id` di production konsisten `sin1::iad1::…` untuk `/`, `/deals`, `/deal/[id]`, `/api/campaigns`, dan `/api/health`. Request masuk lewat edge Singapura, lalu fungsinya berjalan di **iad1 (Washington DC)**.

TTFB terukur dari Asia, lima kali per halaman:

| Halaman | TTFB |
|---|---|
| `/` | 0,82 – 1,08 detik |
| `/deals` | 0,82 – 1,09 detik |
| `/deal/mistine` | 0,60 – 0,82 detik |
| `/daftar` | 0,59 detik |

Tidak ada `vercel.json`, `vercel.ts`, maupun `preferredRegion` di repo, jadi ini region default. Karena homepage `force-dynamic` dan `/deals` dinamis lewat `searchParams`, setiap kunjungan membayar perjalanan lintas Pasifik. Setiap panggilan Redis untuk session dan rate limit menambah lagi.

Ukuran transfernya sendiri sudah bagus: 13 KB ter-gzip untuk `/` dan `/deals`.

**Target fix.** Set region fungsi ke `sin1` (Singapura) atau `hkg1`. Untuk audiens Indonesia ini penghematan ratusan milidetik pada setiap halaman, tanpa perubahan kode.

---

### V4 · P2 — CSP tidak berlaku di `/api/*` dan bisa dilewati lewat header

CSP-nya sendiri sangat baik: `script-src 'self' 'nonce-…' 'strict-dynamic'`, nonce unik per request dan cocok dengan atribut `nonce` di HTML — saya verifikasi tiga request berturut-turut menghasilkan nonce berbeda. Nol console error di production.

Tapi `proxy.ts` memakai matcher dengan pengecualian:

- `source` mengecualikan `api`, jadi seluruh `/api/*` tidak punya CSP sama sekali.
- Blok `missing:` mengecualikan request yang membawa header prefetch. Saya uji langsung ke production:

```
curl -H "purpose: prefetch" https://haluan-tap.vercel.app/   → 0 header CSP
curl -H "next-router-prefetch: 1" ...                        → 0 header CSP
curl tanpa header khusus                                     → 1 header CSP
```

Dokumen HTML yang sama dilayani tanpa CSP hanya karena ada satu header di request. Eksploitasinya terbatas — penyerang tidak bisa menambah header pada navigasi korban — tapi ini tetap lubang cakupan yang akan ditandai pentest mana pun, dan artinya klaim "CSP di semua respons HTML" tidak akurat.

`scripts/smoke-production.mjs:82` hanya memeriksa header di homepage, jadi regresi seperti ini tidak akan tertangkap.

**Target fix.** Hapus blok `missing:` dari matcher, sertakan `/api` dengan policy minimal, dan tambahkan asersi di smoke: `script-src` harus memuat `nonce-` dan tidak boleh memuat `unsafe-inline`, diuji pada satu halaman dan satu route API.

---

### V5 · P2 — Pagination admin baru setengah: server masih full-scan

Tujuan privasinya tercapai — browser tidak lagi menerima PII yang tidak ditampilkan, dan itu perbaikan nyata. Tapi di sisi server:

- `app/api/admin/users/route.ts` selalu mengirim `role: "creator"`, sedangkan `lib/auth.ts:140` hanya memakai jalur `ZREVRANGE` berjendela ketika `!q && !input.role`. Jalur cepat itu **tidak pernah dipakai**; setiap permintaan menarik seluruh user lalu memfilter di memori.
- `lib/requests.ts:36` melakukan hal yang sama untuk setiap pencarian atau filter: `ZREVRANGE 0 -1`, ambil semua record, filter, lalu `slice`.

Debounce 250 ms sudah ada, jadi bukan per ketikan. Pada skala closed beta ini belum terasa; pada 5.000 request itu sepuluh MGET berurutan ke Upstash per pencarian.

**Target fix.** Simpan indeks sekunder di Redis untuk `role`, `status`, dan `picName`, atau terima full-scan tapi cache hasilnya per kombinasi filter selama 30 detik.

---

### V6 · P2 — Satu env var memisahkan production dari bypass autentikasi total

`lib/email-auth.ts:14` mengaktifkan mode test lewat `AUTH_EMAIL_MODE=test`, dan dalam mode itu `/api/auth/verify/request` mengembalikan `debugCode` — kode OTP-nya sendiri — di dalam response. Kalau env itu sampai terpasang di production, siapa pun bisa meminta kode reset untuk email mana pun dan langsung membacanya.

Tidak ada penjaga lapis kedua. Saat ini production aman (endpoint mengembalikan 503), tapi jaraknya hanya satu variabel.

**Target fix.** Tolak mode test ketika `NODE_ENV === "production"`, dan tambahkan unit test yang memastikan `debugCode` tidak pernah muncul di luar mode test.

---

### V7 · P3 — Registrasi tidak atomik dengan pengiriman email

Di `app/api/auth/register/route.ts`, `createUser` berjalan lebih dulu, baru `sendEmailCode`. Kalau Resend gagal, `catch` terluar mengembalikan 500 generik sementara akunnya sudah terbuat dan klaim email serta nomor HP tertahan 30 menit. Creator yang mencoba ulang mendapat 409 "Akun dengan data tersebut tidak dapat dibuat" selama setengah jam.

**Target fix.** Kalau pengiriman gagal, hapus user dan klaimnya sebelum mengembalikan error, dan beri pesan yang menyebut penyebabnya.

---

### V8 · P3 — Pendaftaran yang tidak diverifikasi meninggalkan user yatim

Klaim email dan telepon memakai `EX 1800` selama verifikasi tertunda — ini benar dan sesuai rekomendasi. Tapi record user di `key("user", id)` dan entrinya di sorted set `users` tidak punya TTL. Ketika klaim kedaluwarsa, recordnya tetap ada: muncul di daftar creator admin, dengan email yang bisa diklaim ulang orang lain.

**Target fix.** Sapu berkala user tanpa `emailVerifiedAt` yang lebih tua dari satu jam, atau jangan tulis record user sampai verifikasi selesai.

---

### V9 · P3 — `/daftar?mode=login` merender form daftar lebih dulu

Halaman itu `force-dynamic` dan menerima `searchParams`, tapi mode dibaca di client lewat `window.location.search`. HTML server untuk `/daftar?mode=login` berisi "Mulai dalam satu menit" (form daftar), baru berubah jadi form masuk setelah hidrasi. Setiap link "Masuk creator" menampilkan form yang salah sesaat.

**Target fix.** Baca `searchParams.mode` di server dan kirim sebagai prop awal.

---

## Yang diklaim selesai dan memang terverifikasi

| Klaim | Status | Bukti |
|---|---|---|
| CSP nonce, `unsafe-inline` hilang | **Benar** | Header production: `script-src 'self' 'nonce-…' 'strict-dynamic'`; nonce berbeda di tiga request dan cocok dengan atribut di HTML; nol console error |
| Admin maksimal 50 record per halaman | **Benar** | Route membatasi `limit` ke 50 dan mengembalikan `pagination.total`; PII di luar halaman tidak lagi terkirim |
| Search dan filter admin di server | **Benar** | Query param `q`, `status`, `pic`, `year` diproses di server, debounce 250 ms — lihat V5 untuk sisi bebannya |
| Verifikasi email dan reset dibangun dan diuji | **Benar** | OTP enam digit, hash `id:code`, TTL 30 menit, sekali pakai, rate limit 3/jam per email; enumerasi tertutup |
| Session lama dihapus setelah reset | **Benar** | `resetUserPassword` menghapus seluruh hash session dari `key("user", id, "sessions")` |
| Heading homepage mobile diperbaiki | **Benar** | Production Pixel 7: "Deal yang benar-benar lebih tinggi." dengan spasi |
| Bottom nav tidak menutupi form login | **Benar** | `body:has(.auth-main) .mobile-bottom-nav{display:none}`; di production nav memang tidak tampil di `/daftar` |
| Logo Makarizo, Advan, Somethinc | **Benar** | Ketiganya memuat `brand-media/*.jpg` di production |
| Nama brand Shopee dibersihkan | **Benar** | `realme Authorized Store Tangerang` → `realme`; `SKIN1004 New` → `SKIN1004` |
| HTML audit keluar dari repo | **Benar** | `AUDIT-PUTARAN-3.html` terhapus dari source control |
| QA 5/5 hijau, E2E 38/38 | **Benar** | Saya jalankan sendiri lima kali: exit 0 semua, 38 lolos per run, 29–36 detik |
| Smoke production 8/8 | **Benar** | Saya jalankan sendiri terhadap production: 8/8 |
| Nol kerentanan dependency | **Benar** | `npm audit` di dalam setiap run QA |

---

## Skor

| Area | P1 | P2 | P3 | P4 | Sekarang | Yang menentukan |
|---|---:|---:|---:|---:|---:|---|
| Automated QA | 6 | 9 | 6 | 9,5 | **9,5** | 5/5 hijau, 38 tes; belum ada tes migrasi dan smoke belum menutup CSP api/prefetch |
| Product clarity | 7 | 8 | 8,5 | 8,5 | **9** | Heading beres, fallback "lupa sandi" jujur saat email mati |
| Mobile discovery | 6 | 8 | 8,5 | 9 | **9** | Diverifikasi di production, bukan lokal |
| Security & privacy | 7 | 7,5 | 7,5 | 7,5 | **8,5** | CSP nonce live, PII terpagination, session invalidation, desain OTP sehat; minus `debugCode` dan celah cakupan CSP |
| Data integrity | 3 | 7 | 8 | 8 | **8** | Tidak berubah: 310 record, 22 brand tidak tayang |
| Visual identity | 7 | 6 | 6 | 6,5 | **7** | Tiga logo dan nama Shopee bersih; cakupan logo masih 49% |
| Performance | — | 5 | 8 | 8,5 | **7** | 13 KB gzip bagus, tapi TTFB 0,8–1,1 detik karena fungsi berjalan di iad1 |
| Operational readiness | 6 | 7 | 8 | 8 | **6,5** | Perubahan auth yang memutus dirilis tanpa backfill dan tanpa script migrasi |
| Trust & proof | 4 | 6 | 6 | 6 | **6** | Tidak berubah |
| Conversion journey | 7 | 6,5 | 8 | 8,5 | **6** | Creator lama tidak bisa masuk, dan layar 403-nya buntu |
| SEO & discovery | 2 | 6 | 9 | 9 | **5** | Sitemap, canonical, dan og:image menunjuk host yang tidak resolve |
| **Rata-rata** | **5,5** | **6,9** | **7,6** | **8,1** | **7,4** | Kode naik, rilis dan konfigurasi turun |

---

## Rencana ke 10/10

### Gelombang A — insiden production · hari ini

1. **V1** — buat blokir login bersyarat pada `authEmailEnabled()`, backfill `emailVerifiedAt`, tangani 403 di client, tambah E2E.
2. **V2** — `NEXT_PUBLIC_SITE_URL` diarahkan ke domain yang benar-benar melayani; tambah smoke check bahwa host canonical resolve.
3. **V3** — set region fungsi ke `sin1`.

Ketiganya konfigurasi dan patch kecil. Estimasi setengah hari, dan tanpa nomor 1 closed beta tidak boleh jalan.

### Gelombang B — pengerasan · 1 hari

4. **V4** — matcher CSP mencakup semua respons; smoke memeriksa `nonce-` dan ketiadaan `unsafe-inline`.
5. **V6** — tolak `AUTH_EMAIL_MODE=test` di production, kunci dengan unit test.
6. **V7** — registrasi atomik: hapus user dan klaimnya kalau email gagal terkirim.
7. **V9** — baca `mode` dari `searchParams` di server.

### Gelombang C — aktivasi dan kebersihan · setelah A dan B

8. Pasang `RESEND_API_KEY` dan `EMAIL_FROM`, lalu aktifkan verifikasi email. Setelah itu **V8** (sapu user yatim) menjadi wajib, bukan opsional.
9. **V5** — indeks sekunder atau cache hasil filter admin.
10. Jalankan `npm run qa` lima kali lagi setelah semua perubahan di atas.

### Gelombang D — jalur ops dan aset, paralel

11. ±100 logo brand — cakupan masih 49% TikTok dan 56% Shopee.
12. Konfirmasi intake sample Shopee.
13. 22 brand yang tidak tayang: beri pemilik dan tenggat.
14. Kolom tanggal berlaku di master sheet.

---

## Status gate 10/10

| # | Gate | Status | Task |
|---|---|---|---|
| 1 | Quality gate deterministik: 5× `npm run qa` hijau | **Terpenuhi** | — |
| 2 | Fitur yang bisa dimatikan lewat env punya e2e pembuktinya | **Terpenuhi** | — |
| 3 | Kegagalan satu dependency tidak mematikan jalur lain | **Terpenuhi** | — |
| 4 | Tidak ada angka di UI tanpa sumber | **Terpenuhi** | — |
| 5 | Tidak ada PII ke browser melebihi yang ditampilkan | **Terpenuhi** | — |
| 6 | Setiap record yang tidak tayang punya pemilik dan tenggat | Separuh | D13 |
| 7 | Creator bisa daftar, verifikasi, reset password, lihat deal tanpa menggulir | Belum | V1 + C8 |
| 8 | **Baru:** perubahan yang memutus kompatibilitas data punya backfill dan tes migrasi | **Belum** | V1 |
| 9 | **Baru:** setiap URL kanonik yang diterbitkan menunjuk host yang resolve | **Belum** | V2 |

Gate 5 tertutup di putaran ini. Dua gate baru lahir dari temuan hari ini — keduanya tentang disiplin rilis, bukan tentang kode.

---

## Cara verifikasi dijalankan

- `npm run qa` 5× berturut-turut: exit 0 semua, 38 E2E lolos per run (29–36 detik), termasuk lint, unit test, `npm audit`, dan production build.
- `npm run smoke:production -- https://haluan-tap.vercel.app`: 8/8 lolos.
- Header production diperiksa untuk CSP, HSTS, X-Frame-Options, dan nosniff; nonce dibandingkan antar tiga request dan terhadap atribut `nonce` di HTML.
- CSP diuji ulang dengan header `purpose: prefetch` dan `next-router-prefetch`, serta pada route API.
- DNS `tap.haluandigital.agency` diuji; `robots.txt`, `sitemap.xml`, canonical, dan `og:image` production dibaca.
- TTFB diukur 5× per halaman; `x-vercel-id` dibaca untuk lima route.
- Halaman production dibuka di Pixel 7 dengan penangkap console error; posisi kartu pertama, teks heading, visibilitas bottom nav, dan posisi theme toggle diukur dari DOM.
- Endpoint `POST /api/auth/verify/request` dan `POST /api/auth/login` diprobe di production dengan alamat email fiktif.
- Katalog production dibaca untuk jumlah record, sel rate yang dikecualikan, dan nama brand Shopee.
