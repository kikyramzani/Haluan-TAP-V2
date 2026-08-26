# TAP by Haluan — QC/QA Depth Review, Putaran 6

**Commit:** `215a1bf` · **Production:** https://haluan-tap.vercel.app · **Tanggal:** 16 Agustus 2026
**Skor audit: 8,5/10** (5,5 → 6,9 → 7,6 → 8,1 → 7,4 → **8,5**)

Semua verifikasi dijalankan terhadap production dan repo: `npm run qa` lima kali berturut-turut, smoke production, header CSP pada tiga jenis permukaan, DNS dan canonical, TTFB dan region, proteksi cron, serta pembacaan kode jalur autentikasi dan cache admin.

---

## Ringkasan

**Ini putaran terbersih dari enam putaran, dan skornya tertinggi.** Tidak ada P0. Tidak ada P1. Tiga masalah production putaran lalu ditutup semua dan terbukti di situs live, bukan hanya di kode.

Yang membedakan putaran ini: perbaikannya datang bersama tesnya. Smoke production sekarang memeriksa persis celah yang saya laporkan — nonce ada, `unsafe-inline` tidak ada, CSP hadir di prefetch dan di route API, host canonical hidup, og:image bisa diambil. E2E punya server kedua di port terpisah khusus untuk menguji perilaku ketika provider email mati. Backfill punya mode dry-run sehingga bisa diaudit ulang kapan saja tanpa menulis apa pun.

Sisa jarak ke 10 sekarang **bukan pekerjaan engineering**. Tiga area terendah — data integrity 8, visual identity 7, trust & proof 6 — semuanya ops, aset, dan bukti bisnis.

---

## Tiga masalah production putaran 5: tertutup semua

### V1 · Akun lama terkunci — **tertutup**

`app/api/auth/login/route.ts:16` sekarang `if (authEmailEnabled() && !user.emailVerifiedAt)`. Karena provider email belum aktif di production, gate-nya tidak berlaku dan akun lama bisa masuk.

Di atas itu ada tiga lapis lagi:

- `scripts/backfill-email-verified.mjs` — dry-run secara default, `--apply` untuk menulis, dan memisahkan "legacy" (tanpa `emailVerifiedAt` dan tanpa `emailVerificationStartedAt`) dari "pending" yang sengaja tidak disentuh.
- Field baru `emailVerificationStartedAt` membedakan user lama dari user baru yang memang sedang menunggu verifikasi. Ini yang membuat backfill dan cleanup tidak saling menabrak.
- `tests/e2e/auth-legacy.spec.ts` berjalan di server kedua tanpa env email — jadi jalur "email mati" diuji, bukan diasumsikan.

**Yang tidak bisa saya verifikasi sendiri:** klaim "dua akun legacy di-backfill, nol tersisa" membutuhkan kredensial Redis production yang tidak saya miliki. Tapi karena script-nya dry-run secara default, klaim itu bisa dibuktikan ulang kapan saja dengan satu perintah tanpa efek samping.

### V2 · Domain kanonik — **tertutup**

Diperiksa di production:

| Permukaan | Nilai |
|---|---|
| `rel="canonical"` di `/deal/mistine` | `https://haluan-tap.vercel.app/deal/mistine` |
| `og:image` | `https://haluan-tap.vercel.app/og.png` — dan mengembalikan **200** |
| `robots.txt` | `Sitemap: https://haluan-tap.vercel.app/sitemap.xml` |
| `sitemap.xml` | 699 URL, semuanya domain hidup |

Smoke sekarang mengambil canonical dari HTML, memanggil host-nya, dan gagal kalau bukan 200 — termasuk untuk og:image. Gate 9 punya tesnya sendiri.

### V3 · Region fungsi — **tertutup**

`vercel.json` menetapkan `regions: ["sin1"]`, dan `x-vercel-id` di production sekarang **`sin1::sin1`** untuk semua route. TTFB terukur dari Asia, lima kali per halaman:

| Halaman | Sebelum | Sekarang |
|---|---|---|
| `/` | 0,82 – 1,08 detik | **0,19 – 0,23 detik** |
| `/deals` | 0,82 – 1,09 detik | **0,18 – 0,26 detik** |
| `/deal/mistine` | 0,60 – 0,82 detik | **0,15 – 0,21 detik** |

Turun sekitar **4 sampai 5 kali lipat**. Saya juga bandingkan endpoint yang menyentuh Redis (`/api/campaigns`, 0,16–0,19 detik) dengan yang tidak (`/deal/mistine`) — selisihnya tidak signifikan, jadi Upstash tidak menambah latensi berarti dan tidak perlu dipindahkan.

---

## Empat temuan lain putaran 5: tertutup semua

| ID | Temuan | Bukti verifikasi |
|---|---|---|
| V4 | CSP tidak berlaku di `/api/*` dan bisa dilewati header prefetch | Diuji ulang di production: HTML biasa, `purpose: prefetch`, `next-router-prefetch`, `/api/campaigns`, dan `/api/health` — **kelimanya** membawa CSP. Nonce tetap unik per request. Blok `missing:` dihapus dari matcher |
| V6 | `AUTH_EMAIL_MODE=test` membocorkan OTP | `lib/email-mode.ts:2` — mode test kini butuh `NODE_ENV !== "production"`. `debugEmailCode()` menjadi satu-satunya jalan keluar kode, dan ikut terkunci |
| V7 | Registrasi tidak atomik | `register/route.ts` membungkus pembuatan challenge dan pengiriman email; kalau gagal, `deletePendingUser` menghapus user beserta klaim email dan telepon, lalu mengembalikan 503 dengan pesan spesifik |
| V9 | `/daftar?mode=login` merender form daftar | HTML server untuk `?mode=login` sekarang berisi "Masuk ke akunmu"; tanpa parameter tetap "Mulai dalam satu menit" |

Ditambah dua yang sebelumnya masuk Gelombang C:

- **V8 · user yatim** — `cleanupExpiredPendingUsers` menyapu user tanpa `emailVerifiedAt` yang `emailVerificationStartedAt`-nya lebih dari satu jam, dijadwalkan harian lewat `vercel.json` dan dilindungi `CRON_SECRET`. Diuji di production: tanpa header dan dengan bearer salah, keduanya **401**. `deletePendingUser` menolak menghapus user terverifikasi dan hanya melepas klaim email/telepon yang memang miliknya.
- **V5 · full-scan admin** — hasil filter di-cache 30 detik dengan revision key dari `ZCARD`, dan cache dibersihkan pada setiap penulisan user. Lihat W1 untuk sisa masalahnya.

---

## Temuan baru

Tidak ada P0 dan tidak ada P1. Enam temuan, semuanya P2 ke bawah.

### W1 · P2 — Cache filter admin per-instance, tanpa eviksi

`lib/auth.ts:13` menyimpan hasil filter di `Map` tingkat modul. Tiga konsekuensi:

1. **Invalidasi hanya lokal.** `userFilterCache.clear()` dipanggil di setiap penulisan user — itu benar — tapi hanya membersihkan instance yang menangani penulisan itu. Pada Fluid Compute ada beberapa instance, jadi admin yang memverifikasi creator di satu instance bisa melihat data lama sampai 30 detik kalau permintaan berikutnya mendarat di instance lain.
2. **Revision key tidak menangkap update.** Kunci cache memakai `ZCARD` sebagai revision, dan jumlah user tidak berubah ketika membership atau profil diubah. Jadi tidak ada pembatal kedua selain `.clear()` lokal.
3. **Tidak ada eviksi.** Entri hanya kedaluwarsa secara logis, tidak pernah dihapus dari `Map`. Sesi admin yang banyak mencari akan menumpuk entri, dan setiap entri memegang array `TapUser` lengkap — termasuk alamat dan nomor HP.

**Target fix.** Pindahkan cache ke Redis dengan TTL 30 detik supaya invalidasinya lintas instance, atau tetap di memori tapi tambahkan sapuan entri kedaluwarsa dan batas jumlah entri.

### W2 · P3 — Verifikasi tidak bisa dibedakan dari grandfathering

Tiga jalur berbeda menghasilkan `emailVerifiedAt` yang identik: user yang benar-benar memasukkan kode, user lama yang di-backfill, dan user yang mendaftar ketika provider email mati. Tidak ada penanda yang membedakan.

Begitu Resend aktif, tidak ada cara mengetahui akun mana yang pernah membuktikan kepemilikan email. Untuk produk yang gerbangnya adalah keanggotaan terverifikasi, ini celah jejak audit.

**Target fix.** Tambahkan `verificationSource: "code" | "migrated" | "grandfathered"`. Murah sekarang, mahal kalau ditambahkan setelah ribuan akun.

### W3 · P3 — Cron gagal secara senyap

`app/api/cron/cleanup-users/route.ts` mengembalikan 401 baik ketika secret salah maupun ketika `CRON_SECRET` tidak diset. Kalau env itu belum terpasang di Vercel, job harian gagal selamanya tanpa ada yang tahu — tidak ada log jumlah `removed` yang terlihat, dan tidak ada permukaan status.

**Target fix.** Catat hasilnya (`removed`, durasi) ke audit log yang sudah ada, dan tampilkan waktu jalan terakhir di layar admin.

### W4 · P3 — Kuota reset bisa dipakai mengunci korban

Berlaku begitu email aktif. `verify/request` dibatasi 3 permintaan per jam **per alamat email**, sehingga penyerang yang tahu email korban bisa menghabiskan kuotanya dan memblokir reset kata sandi selama satu jam. Di sisi lain `verify/confirm` mengizinkan 10 kode salah per challenge; setelah itu user butuh kode baru, yang mungkin sudah habis kuotanya.

**Target fix.** Naikkan batas menjadi 5 per jam, hitung terpisah antara permintaan yang benar-benar mengirim email dan yang tidak, dan beri pesan yang menyebut sisa waktu.

### W5 · P3 — Mode email lokal masih boleh aktif di production

`emailTestModeEnabled()` sudah dikunci `NODE_ENV`, tapi `localEmailModeEnabled()` tidak — ia hanya memastikan endpoint-nya localhost. Ini bukan kerentanan: OTP tidak bocor karena `debugEmailCode` butuh mode test. Tapi kalau `AUTH_EMAIL_MODE=local` sampai terpasang di production, `authEmailEnabled()` menjadi true sehingga gerbang verifikasi login menyala sementara setiap pengiriman gagal ke localhost.

**Target fix.** Kunci mode lokal dengan `NODE_ENV` juga.

### W6 · P3 — Cleanup memuat seluruh tabel user ke memori

`cleanupExpiredPendingUsers` menjalankan `ZREVRANGE 0 -1` lalu menarik semua record. Aman pada skala sekarang, tapi ini plafon yang perlu diketahui sebelum jumlah creator masuk puluhan ribu.

**Target fix.** Simpan sorted set terpisah untuk user pending, berkunci `emailVerificationStartedAt`, lalu sapu dengan `ZRANGEBYSCORE`.

---

## Klaim rilis: semuanya terverifikasi

| Klaim | Status | Bukti |
|---|---|---|
| QA 5/5 berturut-turut hijau | **Benar** | Dijalankan sendiri: exit 0 lima kali |
| E2E 45/45 | **Benar** | 45 lolos per run, 38–41 detik |
| Smoke production 9/9 | **Benar** | Dijalankan sendiri terhadap production |
| Nol kerentanan dependency | **Benar** | `npm audit` di dalam setiap run |
| Akun lama tetap bisa login saat email mati | **Benar** | Gate login bersyarat `authEmailEnabled()`; diuji E2E di server kedua |
| Login membuka verifikasi bila email aktif | **Benar** | `AuthClient` menangani `verificationRequired` juga pada mode login |
| Registrasi rollback penuh bila email gagal | **Benar** | `deletePendingUser` melepas user, klaim email, dan klaim telepon; error 503 spesifik |
| Mode test OTP tidak bisa aktif di production | **Benar** | `lib/email-mode.ts:2` menuntut `NODE_ENV !== "production"` |
| Akun pending yatim dibersihkan cron bersecret | **Benar** | Production menolak 401 tanpa dan dengan bearer salah; jadwal di `vercel.json` |
| Canonical, sitemap, og:image ke domain hidup | **Benar** | Ketiganya menunjuk `haluan-tap.vercel.app`; og.png mengembalikan 200 |
| CSP aktif di HTML, prefetch, dan API | **Benar** | Lima permukaan diuji, kelimanya membawa CSP; nonce tetap unik |
| Form login benar sejak server render | **Benar** | HTML `?mode=login` berisi "Masuk ke akunmu" |
| Filter admin memakai cache 30 detik | **Benar** | Revision key `ZCARD` + TTL 30 detik — lihat W1 |
| Region pindah ke sin1 | **Benar** | `x-vercel-id: sin1::sin1` di semua route |
| TTFB homepage 167–235 ms | **Benar** | Terukur 0,19–0,23 detik warm; sebelumnya 0,82–1,08 |
| Dua akun legacy di-backfill, nol tersisa | **Tidak dapat diverifikasi** | Butuh kredensial Redis production. Script dry-run membuat klaim ini dapat dibuktikan ulang kapan saja tanpa efek samping |

---

## Skor

| Area | P1 | P2 | P3 | P4 | P5 | Sekarang | Yang menentukan |
|---|---:|---:|---:|---:|---:|---:|---|
| Automated QA | 6 | 9 | 6 | 9,5 | 9,5 | **10** | 5/5 hijau, 45 tes, server kedua untuk mode email mati, smoke menutup persis celah yang dilaporkan |
| SEO & discovery | 2 | 6 | 9 | 9 | 5 | **9** | Canonical, sitemap, og:image hidup, dan ada tes yang menjaganya |
| Performance | — | 5 | 8 | 8,5 | 7 | **9** | TTFB 0,15–0,26 detik dari Asia, region sin1, 13 KB gzip |
| Security & privacy | 7 | 7,5 | 7,5 | 7,5 | 8,5 | **9** | Mode test terkunci, cron bersecret, rollback bersih; minus cache PII dan jejak verifikasi |
| Product clarity | 7 | 8 | 8,5 | 8,5 | 9 | **9** | SSR login benar, pesan error spesifik per penyebab |
| Mobile discovery | 6 | 8 | 8,5 | 9 | 9 | **9** | Diverifikasi ulang di production: tanpa overflow, tanpa console error |
| Conversion journey | 7 | 6,5 | 8 | 8,5 | 6 | **8,5** | Login pulih, jalur verifikasi otomatis; reset mandiri masih menunggu Resend |
| Operational readiness | 6 | 7 | 8 | 8 | 6,5 | **8,5** | Backfill dry-run, cron terjadwal, runbook diperbarui, E2E dua mode; minus cron yang gagal senyap |
| Data integrity | 3 | 7 | 8 | 8 | 8 | **8** | Tidak berubah: 310 record, 22 brand tidak tayang |
| Visual identity | 7 | 6 | 6 | 6,5 | 7 | **7** | Cakupan logo 50% TikTok dan 57% Shopee |
| Trust & proof | 4 | 6 | 6 | 6 | 6 | **6** | Belum ada bukti settlement yang dipublikasikan |
| **Rata-rata** | **5,5** | **6,9** | **7,6** | **8,1** | **7,4** | **8,5** | Tertinggi dari enam putaran |

---

## Sisa jarak ke 10 bukan pekerjaan engineering

Tiga area terendah menyumbang hampir seluruh selisih 1,5 poin, dan tidak satu pun diselesaikan dengan menulis kode:

- **Trust & proof 6** — setelah enam putaran, TAP secara teknis siap tetapi belum punya satu pun bukti pendapatan creator yang dipublikasikan. Ini risiko bisnis terbesar yang tersisa, bukan risiko teknis.
- **Visual identity 7** — separuh katalog masih menampilkan kotak inisial. Pekerjaan desain.
- **Data integrity 8** — 22 brand tidak tayang karena format rate di master sheet, termasuk Maybelline dan Implora. Pekerjaan ops.

Ditambah dua hal yang menunggu input eksternal: kunci Resend dan DNS `tap.haluandigital.agency`.

---

## Rencana ke 10/10

### Gelombang A — pengerasan sisa · ±½ hari

1. **W1** — pindahkan cache filter admin ke Redis, atau tambahkan sapuan dan batas entri.
2. **W2** — tambahkan `verificationSource` sebelum jumlah akun bertambah.
3. **W3** — catat hasil cron ke audit log dan tampilkan waktu jalan terakhir di admin.
4. **W5** — kunci mode email lokal dengan `NODE_ENV`.

### Gelombang B — aktivasi · menunggu input eksternal

5. Pasang `RESEND_API_KEY` dan `EMAIL_FROM`, verifikasi domain pengirim. Setelah aktif, **W4** menjadi relevan: naikkan kuota permintaan kode.
6. Aktifkan DNS `tap.haluandigital.agency`, tambahkan domain di Vercel, pindahkan `NEXT_PUBLIC_SITE_URL`, pasang redirect 301. Smoke canonical akan menangkap kalau ada yang tertinggal.
7. Jalankan `npm run qa` lima kali lagi setelah keduanya.

### Gelombang C — ops dan aset

8. ±100 logo brand — cakupan sekarang 50% dan 57%.
9. 22 brand tidak tayang: beri pemilik dan tenggat.
10. Konfirmasi tertulis intake sample Shopee.
11. Kolom `Berlaku hingga` di master sheet.

### Gelombang D — bukti bisnis

12. Satu campaign closed beta sampai tuntas dengan bukti settlement yang boleh dipublikasikan. Ini satu-satunya jalan menaikkan Trust & proof dari 6, dan syarat sebelum paid acquisition.

---

## Status gate 10/10

| # | Gate | Status | Task |
|---|---|---|---|
| 1 | Quality gate deterministik: 5× `npm run qa` hijau | **Terpenuhi** | — |
| 2 | Fitur yang bisa dimatikan lewat env punya e2e pembuktinya | **Terpenuhi** | — |
| 3 | Kegagalan satu dependency tidak mematikan jalur lain | **Terpenuhi** | — |
| 4 | Tidak ada angka di UI tanpa sumber | **Terpenuhi** | — |
| 5 | Tidak ada PII ke browser melebihi yang ditampilkan | **Terpenuhi** | — |
| 8 | Perubahan yang memutus kompatibilitas data punya backfill dan tes migrasi | **Terpenuhi** | — |
| 9 | Setiap URL kanonik yang diterbitkan menunjuk host yang resolve | **Terpenuhi** | — |
| 6 | Setiap record yang tidak tayang punya pemilik dan tenggat | Separuh | C9 |
| 7 | Creator bisa daftar, verifikasi, reset password, lihat deal tanpa menggulir | Menunggu | B5 |
| 10 | **Baru:** setiap klaim publik tentang hasil creator punya bukti yang dapat diaudit | **Belum** | D12 |

Tujuh dari sepuluh terpenuhi. Gate 8 dan 9 — dua gate yang lahir dari insiden putaran lalu — ditutup dalam satu putaran, lengkap dengan tesnya.

---

## Cara verifikasi dijalankan

- `npm run qa` 5× berturut-turut: exit 0 semua, 45 E2E lolos per run, 38–41 detik.
- `npm run smoke:production -- https://haluan-tap.vercel.app`: 9/9 lolos.
- CSP diuji pada lima permukaan: HTML biasa, `purpose: prefetch`, `next-router-prefetch`, `/api/campaigns`, `/api/health`; nonce dibandingkan antar request.
- `x-vercel-id` dibaca untuk tiga route; TTFB diukur 5× per halaman; endpoint dengan dan tanpa Redis dibandingkan.
- `robots.txt`, `sitemap.xml`, canonical, dan og:image production dibaca; og.png diambil.
- `/api/cron/cleanup-users` diprobe tanpa header dan dengan bearer salah.
- `/api/auth/verify/request` diprobe dengan alamat fiktif; `/daftar?mode=login` dan `/daftar` dibandingkan HTML server-nya.
- Production dibuka di Pixel 7 pada empat halaman dengan penangkap console error dan pemeriksaan overflow horizontal.
- Katalog production dibaca untuk jumlah record, sel yang dikecualikan, dan cakupan logo.
