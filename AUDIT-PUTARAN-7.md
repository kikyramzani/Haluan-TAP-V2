# TAP by Haluan — QC/QA Depth Audit, Board Review, dan Improvement Plan

- **Putaran:** 7
- **Tanggal:** 17 Agustus 2026
- **Basis kode:** commit `215a1bf` + working tree yang belum di-commit
- **Production yang diuji:** `https://haluan-tap.vercel.app`

**Skor tertimbang:** **8,0/10**

## Keputusan board

**Closed beta terbatas: GO WITH CONDITIONS.** Pertahankan jumlah admin kecil, audit semua akun admin aktif, dan jangan anggap penghapusan email dari `ADMIN_EMAILS` sudah mencabut akses.

**Promosi working tree ke production: HOLD.** Tutup temuan P1 tentang pencabutan akses admin dan P2 tentang konsumsi kode sekali pakai sebelum deploy batch ini.

**Paid acquisition: NO-GO.** Selain dua temuan di atas, custom domain, provider email, pemilik/SLA operasi, data campaign yang ditahan, dan bukti settlement creator belum lengkap.

Skor turun dari 8,5 ke 8,0 bukan karena kualitas implementasi umum memburuk. Audit ini memakai standar yang lebih dalam: sesi admin setelah offboarding, race condition OTP, konsistensi indeks identitas, retensi agregat attribution, cakupan browser, dan keselarasan dokumen dengan keputusan produk.

## Ringkasan untuk board

Fondasi produk sudah kuat. Gate lokal hijau penuh, production sehat, katalog cepat dari region Singapura, UI mobile tidak overflow, dan data rate ambigu tetap fail-closed. Batch perbaikan terbaru juga menutup sebagian besar temuan putaran 6: cache admin dibatasi, revision lintas instance ditambahkan, cleanup tidak lagi full-scan, sumber verifikasi disimpan, mode email developer dikunci di Vercel production, dan pesan rate limit lebih jelas.

Namun satu risiko akses istimewa belum tertangkap tes: role admin disimpan permanen di record user. `ADMIN_EMAILS` hanya dibaca saat akun dibuat atau ketika Google sign-in dijalankan. Menghapus mantan operator dari allowlist tidak menurunkan role-nya dan tidak mencabut session yang dapat hidup 30 hari. Karena admin dapat membaca email, nomor HP, alamat, GMV, request sample, dan audit trail, ini menjadi blocker sebelum skala pengguna diperbesar.

Risiko berikutnya adalah OTP yang dibaca lalu dihapus dengan dua command. Dua request paralel dapat sama-sama melewati validasi sebelum salah satunya menghapus challenge. Untuk reset password, hasil akhirnya ditentukan request yang menulis terakhir. Ini bertentangan dengan sifat “sekali pakai”.

Di sisi bisnis, risiko terbesar tetap sama: TAP belum memiliki bukti settlement creator yang dapat diaudit. Produk sudah dapat memperlihatkan peluang dan menjalankan operasi, tetapi belum cukup bukti untuk membuat klaim outcome atau membiayai acquisition.

## Bukti verifikasi

### Gate kode saat ini

| Pemeriksaan | Hasil |
|---|---:|
| Lint | Lulus |
| Unit/security test | **13/13 lulus** |
| Dependency audit | **0 vulnerability** |
| Production build Next.js 16.3.1 | Lulus |
| E2E Chromium mobile + desktop + legacy auth | **45/45 lulus** |
| `git diff --check` | Lulus |

Satu run penuh `npm run qa` selesai tanpa error. Klaim lima run berturut-turut tercatat di dokumen implementasi, tetapi audit putaran ini hanya menjalankan dan menyaksikan satu run penuh.

### Production

| Pemeriksaan | Hasil |
|---|---:|
| Smoke production | **9/9 lulus** |
| `/api/health` | **200 · ready** |
| Region fungsi | **sin1** |
| TTFB pengukuran tunggal: homepage | 371 ms |
| TTFB pengukuran tunggal: `/deals` | 198 ms |
| TTFB pengukuran tunggal: `/deal/mistine` | 226 ms |
| TTFB pengukuran tunggal: API TikTok | 55 ms |
| CSP | Hadir pada seluruh route yang diprobe |
| Custom domain `tap.haluandigital.agency` | **Belum resolve — ENOTFOUND** |

TTFB di atas adalah snapshot satu permintaan per route, bukan benchmark statistik. Production yang aktif masih mewakili baseline commit; perbaikan working tree belum dapat dianggap live hanya karena QA lokal lulus.

### Data dan aset

| Area | Hasil saat audit |
|---|---:|
| TikTok terbit | 310 brand |
| Shopee terbit | 383 campaign |
| Sel rate ditahan | 50 sel pada 35 brand |
| Campaign TikTok tidak terbit | 22 |
| Open plan belum terverifikasi | 1 |
| Cakupan logo TikTok | 156/310 · **50,3%** |
| Cakupan logo Shopee | 218/383 · **56,9%** |

## Temuan prioritas

### R7-01 · P1 — Menghapus email dari admin allowlist tidak mencabut akses

`lib/auth.ts:53-65` menetapkan `role: "admin"` saat akun dibuat. `getCurrentUser` kemudian mengembalikan record itu apa adanya dan semua route admin memercayai `user.role`. Pada Google upsert, akun yang sudah admin juga tidak pernah diturunkan karena jalur non-admin mempertahankan `existing.role` (`lib/auth.ts:80-89`). Session berlaku 30 hari (`lib/auth.ts:94-103`).

Runbook meminta tim “remove access no longer required” lewat review allowlist, tetapi perubahan allowlist saja tidak berpengaruh ke akun dan session yang sudah ada. Mantan operator tetap dapat membaca creator PII dan mengubah membership/sample.

**Perbaikan.** Jadikan allowlist sebagai otorisasi dinamis pada setiap admin request, bukan hanya bootstrap role. Saat email keluar dari allowlist, turunkan role, hapus seluruh session user, dan tulis audit event. Tambahkan E2E: buat admin, hapus dari allowlist/reconcile, pastikan session lama langsung menerima 403.

**Selesai bila.** Tidak ada route admin yang hanya bergantung pada role tersimpan, dan bukti offboarding mencakup session aktif.

### R7-02 · P2 — Challenge OTP tidak dikonsumsi secara atomik

`lib/email-auth.ts:27-32` menjalankan `GET`, memvalidasi kode, lalu `DEL`. Dua request paralel dapat membaca challenge yang sama sebelum deletion. Pada reset password, keduanya dapat mengganti password; write terakhir menang.

**Perbaikan.** Gunakan operasi Redis atomik, idealnya Lua compare-and-delete berdasarkan purpose dan `codeHash`. Jangan memakai `GETDEL` mentah karena kode salah tidak boleh menghabiskan challenge yang benar. Tambahkan concurrency test dengan dua confirm paralel; hanya satu yang boleh sukses.

### R7-03 · P2 — Perubahan nomor WhatsApp merusak indeks unik

Registrasi membuat klaim `tap:v1:phone:{nomor}` (`lib/auth.ts:45-50`), tetapi update profil hanya menulis field `phone` ke record user (`lib/auth.ts:229-235`). Nomor lama tetap terkunci, nomor baru tidak diklaim, dan dua akun dapat berakhir memakai nomor yang sama.

**Perbaikan.** Buat operasi pergantian nomor yang atomik: normalisasi, claim nomor baru dengan `NX`, tulis user, lalu lepas claim lama hanya jika owner-nya user yang sama. Audit perubahan dan uji collision/rollback.

### R7-04 · P2 — Retensi attribution tidak konsisten dengan metrik

Event click memiliki TTL 180 hari dan sorted set event dipangkas (`lib/events.ts:5-15`). Namun counter per campaign, counter per user, dan `campaigns:clicked` tidak pernah dikurangi atau kedaluwarsa (`lib/events.ts:16-18`). Akibatnya `total` merepresentasikan 180 hari, sedangkan rincian campaign adalah lifetime (`lib/events.ts:28-34`). Counter user juga bertahan tanpa batas.

**Perbaikan.** Pilih definisi metrik yang eksplisit. Untuk rolling 180 hari, hitung dari event/bucket harian yang ikut expire. Untuk lifetime, tampilkan label lifetime dan tetapkan retensi/anonymization user ID. Tambahkan test yang memajukan waktu melewati 180 hari dan memeriksa total serta breakdown tetap konsisten.

### R7-05 · P2 — Dokumentasi keamanan bertentangan dengan produk yang live

Keputusan produk dan halaman legal menyatakan link campaign memang publik. Kode juga mengirim raw affiliate URL lewat endpoint publik yang di-throttle. Namun:

- `README.md:32-33` menyatakan API publik tidak pernah mengekspos raw link dan `/go` membership-gated.
- `PRODUCT-AND-CONTENT.md:48-59` melarang raw TAP link ke browser dan menyatakan resolver gated.
- `PRODUCTION-READINESS.md:18` menyatakan link sengaja publik, tetapi baris 34 dan checklist baris 53 kembali menyatakan raw link tidak boleh terekspos.
- Runbook mengategorikan raw affiliate link publik sebagai contoh SEV-1.

Ini dapat membuat engineer atau incident commander mematikan fitur yang memang disengaja, atau sebaliknya mengabaikan exposure yang sebenarnya tidak sengaja.

**Perbaikan.** Tetapkan satu klasifikasi: katalog teragregasi publik, affiliate URL individual publik dan throttled, feed mentah/internal tetap privat. Selaraskan README, product reference, readiness, smoke wording, dan runbook severity.

### R7-06 · P2 — Rate limit email masih dapat dipakai mengunci satu korban

`verify/request` menghitung kuota lima permintaan per alamat sebelum account lookup (`app/api/auth/verify/request/route.ts:15-20`). IP limit 20/jam membatasi skala, tetapi satu IP tetap cukup untuk menghabiskan kuota satu korban. Korban kemudian menerima 429 ketika mencoba meminta kode sendiri.

**Perbaikan.** Gunakan cooldown pengiriman, pertahankan challenge terakhir, dan sediakan jalur memasukkan kode yang sudah diterima tanpa harus meminta ulang. Pisahkan anti-enumeration response dari keputusan internal untuk benar-benar mengirim email. Uji abuse satu korban dan recovery pengguna sah.

### R7-07 · P3 — Monitoring cron hanya membuktikan sukses terbaru

Cron menulis audit event hanya setelah cleanup berhasil, dan kegagalan menulis audit sengaja diabaikan. UI mencari event cleanup hanya dari batch audit terbaru. Jika cleanup gagal sebelum pencatatan, audit store bermasalah, atau lebih dari 100 event lain masuk sejak run terakhir, layar dapat berkata “belum pernah tercatat” tanpa membedakan penyebab.

**Perbaikan.** Simpan heartbeat khusus dengan status `started/succeeded/failed`, error class, durasi, dan timestamp. Tampilkan stale threshold di admin dan alert bila tidak sukses dalam 26 jam. Jangan bergantung pada daftar 100 audit event untuk status terakhir.

### R7-08 · P3 — Sumber verifikasi tidak naik setelah bukti yang lebih kuat

Field baru sudah baik, tetapi Google sign-in mempertahankan `migrated`/`grandfathered` bila field telah terisi (`lib/auth.ts:86`). Password reset juga mempertahankan source lama (`lib/auth.ts:166`). Runbook justru meminta akun lama melakukan reset untuk mendapatkan trust lebih tinggi. Setelah reset berhasil, admin masih melihat label seolah email belum pernah dibuktikan.

**Perbaikan.** Definisikan precedence `grandfathered/migrated < code/google`. Google sign-in sukses harus menjadi `google`; reset dengan kode sukses harus menjadi `code`, dengan audit before/after.

### R7-09 · P3 — Pencarian admin tetap full-scan pada cache miss

Cache sekarang bounded dan revision-aware, sebuah perbaikan nyata. Namun pencarian pertama setelah perubahan tetap mengambil seluruh ID dan seluruh record user/sample ke memory server (`lib/auth.ts:208-215` dan pola yang sama di `lib/requests.ts`). Ini belum menjadi masalah pada skala sekarang, tetapi menjadi plafon saat data masuk puluhan ribu record.

**Perbaikan.** Sebelum 10 ribu creator/request, gunakan secondary index yang relevan atau search store yang menyimpan field minimum. Hindari membuat cache PII lengkap untuk setiap query.

### R7-10 · P3 — QA browser dan visual belum mewakili risiko produksi

Suite 45 tes kuat, tetapi hanya memakai Chromium. Belum ada WebKit/iOS Safari, visual regression, performance budget, concurrent OTP test, partial Redis failure test, atau synthetic production flow yang benar-benar mendaftar, login, membuka deal, dan menyelesaikan request sample.

Audit visual Pixel-sized viewport tidak menemukan horizontal overflow atau console error. Namun beberapa kontrol sekunder masih kecil: chip kategori sekitar 30 px tinggi, link kembali/footer 13–15 px, dan mode list mengandalkan typography 5–10,5 px. Axe “serious violations” hijau tidak membuktikan readability, touch comfort, atau WCAG 2.2 target-size coverage menyeluruh.

**Perbaikan.** Tambahkan WebKit mobile, audit axe semua severity yang disepakati, assertion target sentuh untuk kontrol utama, serta screenshot baseline untuk homepage, katalog, auth, detail deal, dashboard, dan admin.

## Hal yang sudah baik

- Semua write route penting memakai same-origin check dan server-side session/role checks.
- Password memakai salted `scrypt`; cookie hanya membawa token acak HttpOnly.
- Public catalog tidak mengirim internal note, PIC, atau creator PII.
- Rate parser menahan format ambigu; 50 sel tidak ditebak.
- Sample request memerlukan membership verified dan campaign yang memang memiliki sample.
- CSP nonce, security headers, open-redirect prevention, private/no-store untuk PII, dan rate limiting sudah ada.
- Homepage/deals server-rendered, sitemap memuat landing brand, canonical/OG hidup, dan production berada di `sin1`.
- UI mobile rapi, tidak overflow, dan jalur utama bisa dipahami tanpa dokumentasi.
- Perubahan working tree memperbaiki cache admin, pending-user index, retry guidance, cron success trail, dan layout detail brand.

## Skor tertimbang

| Area | Bobot | Skor | Kontribusi | Penentu utama |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 7,1 | 1,14 | P1 offboarding admin, OTP race, phone index |
| Functional correctness | 14% | 8,6 | 1,20 | Jalur utama lengkap; edge-state identitas masih terbuka |
| Automated QA | 12% | 9,1 | 1,09 | 13 unit + 45 E2E; belum WebKit/concurrency/fault injection |
| Reliability & operations | 10% | 7,7 | 0,77 | Health/smoke/runbook kuat; cron failure dan external dependencies |
| Data integrity | 10% | 7,5 | 0,75 | Fail-closed bagus; 50 sel/35 brand dan retensi metrik |
| UX & conversion | 10% | 8,5 | 0,85 | Hierarki jelas, mobile rapi; auth dan discovery masih padat |
| Performance | 8% | 8,8 | 0,70 | Region tepat dan response cepat; belum ada performance budget |
| Accessibility | 6% | 8,2 | 0,49 | Axe hijau; target sentuh/readability belum lengkap |
| SEO & discovery | 5% | 9,0 | 0,45 | SSR, sitemap, canonical, OG hidup |
| Visual identity | 5% | 7,2 | 0,36 | Sistem visual kuat; cakupan logo 50,3%/56,9% |
| Trust & proof | 4% | 6,0 | 0,24 | Belum ada settlement proof yang dapat diaudit |
| **Total** | **100%** |  | **8,0/10** |  |

## Improvement plan

### Gelombang 0 — containment hari ini

1. Inventaris semua record `role=admin`, bandingkan dengan allowlist aktif, dan catat hasilnya.
2. Untuk admin yang tidak lagi berwenang, turunkan role langsung di datastore dan hapus semua session hash user. Menghapus email dari env saja tidak cukup.
3. Batasi closed beta pada operator yang sudah dikonfirmasi sampai R7-01 selesai.

- **Owner:** technical + privacy owner.
**Exit:** nol admin di luar allowlist dan seluruh session lama yang tidak sah gagal mengakses API admin.

### Gelombang A — blocker engineering sebelum deploy · 1–2 hari

1. R7-01: dynamic admin authorization + session revocation + E2E offboarding.
2. R7-02: atomic OTP compare-and-delete + concurrency test.
3. R7-03: atomic phone reindex + collision/rollback test.
4. R7-05: satu kontrak publik/private untuk affiliate link, lalu selaraskan seluruh dokumen dan smoke wording.
5. Jalankan `npm run qa` lima kali setelah patch dan review diff khusus auth/data.

### Gelombang B — reliability dan evidence · 2–4 hari

1. R7-04: definisi retention attribution dan bucket/counter yang konsisten.
2. R7-06: desain ulang quota email agar anti-enumeration tidak menjadi lockout korban.
3. R7-07: heartbeat cron sukses/gagal + alert stale.
4. R7-08: verification-source precedence dan audit transition.
5. Tambahkan WebKit mobile, OTP concurrency, Redis partial-failure, dan target-size tests.

### Gelombang C — launch dependencies · menunggu owner eksternal

1. Aktifkan Resend dan uji deliverability, bounce, reset, serta verification production.
2. Aktifkan `tap.haluandigital.agency`, 301 dari alias lama, lalu ulang smoke/canonical/OG.
3. Tetapkan owner, SLA, quota, dan jalur eskalasi sample TikTok/Shopee.
4. Bersihkan 50 sel pada 35 brand sampai excluded campaign nol atau setiap pengecualian punya owner/tenggat.
5. Naikkan cakupan logo ke minimal 85% pada kedua platform.
6. Tetapkan retention schedule dan proses export/delete creator.

### Gelombang D — bukti bisnis sebelum paid acquisition

Jalankan minimal satu closed-beta campaign sampai settlement. Simpan bukti yang boleh diaudit: jumlah creator, GMV tervalidasi, komisi dibayar, waktu approval/sample, conversion, dispute, dan tanggal settlement. Copy publik hanya boleh memakai angka yang sumber dan periodenya dapat ditunjukkan.

## Gate menuju release berikutnya

| Gate | Status |
|---|---|
| QA deterministik lulus | Terpenuhi untuk satu run audit |
| Production smoke 9/9 | Terpenuhi pada alias Vercel |
| Admin access langsung dicabut saat keluar allowlist | **Belum** |
| OTP benar-benar single-use di bawah concurrency | **Belum** |
| Indeks email/phone konsisten setelah update | **Belum** |
| Attribution total dan breakdown memakai periode sama | **Belum** |
| Dokumen publik/private link konsisten | **Belum** |
| Email verification/reset production aktif | **Belum** |
| Custom domain resolve dan canonical pindah | **Belum** |
| Semua data yang ditahan punya owner dan tenggat | **Belum** |
| Bukti settlement creator dapat diaudit | **Belum** |

## Kesimpulan

TAP sudah melewati fase “prototype yang perlu distabilkan”. Produk ini sekarang berada pada fase governance dan scale hardening. Pekerjaan bernilai tertinggi bukan menambah fitur, tetapi memastikan akses admin benar-benar dapat dicabut, OTP benar-benar sekali pakai, identitas tetap konsisten, metrik memiliki definisi periode yang sama, dan dokumen operasi tidak bertentangan dengan perilaku produk.

Setelah Gelombang 0 dan A selesai, skor realistis naik ke sekitar 8,7. Nilai di atas 9 baru layak setelah email/domain/ops aktif dan ada bukti settlement yang dapat diaudit.
