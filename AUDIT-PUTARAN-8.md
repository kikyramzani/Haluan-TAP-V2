# TAP by Haluan — QC/QA Depth Audit, Board Review, dan Improvement Plan

- **Putaran:** 8
- **Tanggal:** 17 Agustus 2026
- **Basis kode:** commit `215a1bf` + working tree 33 file, `+590/−168`
- **Production yang diuji:** `https://haluan-tap.vercel.app`

**Skor tertimbang:** **8,1/10**

## Keputusan board

**Closed beta saat ini: GO WITH STRICT CONDITIONS.** Jangan menambah alamat admin baru sebelum gate bukti kepemilikan email diperbaiki. Audit seluruh akun admin production berdasarkan `verificationSource`; akun `grandfathered` atau `migrated` tidak boleh dianggap admin terverifikasi hanya karena alamatnya ada di allowlist.

**Promosi working tree sebagai satu batch: HOLD.** Pencabutan admin dan OTP atomik layak dipertahankan, tetapi jalur pemberian admin membuka P1 baru. Perbaiki juga claim nomor WhatsApp dan race cooldown email sebelum deploy.

**Paid acquisition: NO-GO.** Custom domain, provider email production, bukti operasi sample, data campaign yang ditahan, retention policy, dan bukti settlement masih belum lengkap.

## Ringkasan eksekutif

Remediasi ini meningkatkan kualitas produk secara nyata. Lima temuan putaran 7 tertutup penuh, tiga tertutup sebagian, dan dua backlog memang belum disentuh. Pencabutan admin sekarang efektif pada permintaan admin berikutnya. OTP paralel hanya dapat dipakai sekali. Periode attribution sudah jelas. Heartbeat cron tidak lagi bergantung pada 100 audit event terakhir. Presedensi verifikasi juga sudah benar.

Namun implementasi dua arah allowlist memperkenalkan risiko yang lebih penting daripada gap sebelumnya: setiap akun yang emailnya masuk `ADMIN_EMAILS` dapat dipromosikan tanpa memeriksa apakah email pernah dibuktikan. Audit targeted membuktikan akun `grandfathered`, membership `pending`, dan role awal `creator` mendapat HTTP 200 dari API admin lalu disimpan sebagai `role=admin`. Pada production yang provider emailnya belum aktif, ini menjadikan kepemilikan alamat admin sebagai asumsi, bukan bukti.

Dua closure lain belum penuh. Mengosongkan nomor WhatsApp meninggalkan claim nomor lama, dan rangkaian claim–write–release belum atomik terhadap kegagalan datastore. Cooldown reset juga memiliki jendela antara claim cooldown dan pembuatan active challenge; request kedua pada jendela itu mendapat challenge acak yang tidak dapat digunakan.

Secara keseluruhan, engineering readiness naik, tetapi masih ada satu P1 dan dua P2 yang harus ditutup sebelum batch dipromosikan.

## Bukti yang diverifikasi ulang

### Gate lokal

| Pemeriksaan | Hasil audit |
|---|---:|
| `npm run qa` berurutan | **5/5 hijau** |
| Unit/security test | **14/14 per run** |
| E2E executions | **49/49 per run** |
| Skenario E2E unik | **25** |
| Dependency audit | **0 vulnerability** |
| Build Next.js 16.3.1 | Lulus 5/5 |
| `git diff --check` | Lulus |

Kenaikan 45→49 berasal dari **dua skenario baru**—offboarding admin dan OTP concurrency—yang masing-masing dieksekusi pada mobile dan desktop Chromium. Jadi ada empat eksekusi tambahan, bukan empat skenario coverage baru.

### Production

| Pemeriksaan | Hasil |
|---|---:|
| Smoke production | **9/9 lulus** |
| `/api/health` | **200 · ready** |
| Region | **sin1** |
| CSP pada route yang diprobe | Hadir |
| Snapshot TTFB homepage | 617 ms |
| Snapshot TTFB health | 143 ms |
| `tap.haluandigital.agency` | **ENOTFOUND** |

Angka TTFB adalah satu snapshot, bukan benchmark. Production masih mewakili baseline yang sudah dideploy; keberhasilan working tree lokal tidak membuktikan remediasi ini sudah live.

### Data

| Area | Kondisi |
|---|---:|
| TikTok terbit | 310 brand |
| Sel rate ditahan | 50 |
| Brand perlu cleanup | 35 |
| Campaign TikTok tidak terbit | 22 |
| Cakupan logo TikTok | sekitar 50% |
| Cakupan logo Shopee | sekitar 57% |

## Status delapan closure

| ID | Status | Hasil review |
|---|---|---|
| R7-01 · Offboarding admin | **Tertutup untuk revocation** | Permintaan admin berikutnya menurunkan role, menghapus session, dan menolak akses. Jalur granting memunculkan R8-01 P1 baru. |
| R7-02 · OTP atomik | **Tertutup** | Validasi dilakukan sebelum `DEL`; hanya request dengan hasil `DEL=1` yang melanjutkan. E2E concurrency membuktikan satu 200 dan satu 400. |
| R7-03 · Indeks WhatsApp | **Parsial** | Collision mendapat 409, tetapi clear-number dan rollback claim belum benar. |
| R7-04 · Periode metrik | **Tertutup** | Headline dan breakdown sama-sama lifetime; event retained 180 hari ditampilkan terpisah. |
| R7-05 · Dokumentasi link | **Hampir tertutup** | Klasifikasi utama sudah konsisten. Runbook masih menyebut “gated redirect” pada weekly check. |
| R7-06 · Lockout reset | **Parsial** | Kuota korban hilang, tetapi cooldown dapat mengembalikan challenge palsu pada gap/failure state. |
| R7-07 · Heartbeat cron | **Tertutup dengan batasan** | Fixed key dan stale warning benar. Kegagalan Redis tidak dapat ditulis ke Redis yang sama; external alert tetap dibutuhkan. |
| R7-08 · Presedensi verifikasi | **Tertutup** | `grandfathered/migrated` kalah dari `code/google`; unit test menjaga transisi. |

## Temuan putaran 8

### R8-01 · P1 — Allowlist dapat mempromosikan akun yang belum membuktikan email

`reconcileAdminRole` hanya memeriksa apakah email ada di `ADMIN_EMAILS` (`lib/auth.ts:203-219`). Ia tidak memeriksa `emailVerifiedAt`, `verificationSource`, membership, atau re-authentication. Kondisi early return juga mempertahankan admin lama tanpa menguji kekuatan bukti email.

Audit targeted membuat record berikut:

- `verificationSource: "grandfathered"`
- `membership: "pending"`
- `role: "creator"`
- email ada di `ADMIN_EMAILS`

Hasilnya: login **200**, `/api/admin/users` **200**, dan record berubah menjadi `role: "admin"`. Ini membuktikan label UI “Administrator terverifikasi” belum dijamin backend.

Risikonya paling tinggi ketika provider email production belum aktif atau ketika alamat baru ditambahkan ke allowlist sementara akun dengan alamat itu sudah lebih dulu dibuat.

**Perbaikan.** Otorisasi admin harus menuntut tiga hal: email berada di allowlist, `emailVerifiedAt` ada, dan `verificationSource` adalah `code` atau `google`. Untuk akun `migrated/grandfathered`, paksa challenge email atau Google sign-in sebelum grant. Tambahkan E2E grant positif dan negatif: akun strong-proof mendapat 200; akun unproven tetap 403 dan tidak berubah role.

**Containment.** Jangan menambah email admin baru. Audit semua admin production. Jika ada source lemah, cabut allowlist atau paksa verifikasi sebelum deploy.

### R8-02 · P2 — Claim nomor WhatsApp masih tidak atomik dan tidak dibersihkan saat dikosongkan

`lib/auth.ts:278-292` menetapkan `phoneMoved` hanya jika nomor baru truthy. Ketika creator menghapus nomor, record berubah menjadi `phone: ""`, tetapi claim nomor lama tidak dilepas.

Audit targeted membuktikan:

- PATCH profil: **200**
- `phone` pada user: `""`
- `tap:v1:phone:{nomor-lama}`: masih menunjuk user lama

Selain itu, bila claim nomor baru berhasil tetapi `setJson(user)` gagal, claim baru tertinggal. Urutan operasi mengurangi risiko collision, tetapi belum atomik seperti klaim implementasi.

**Perbaikan.** Tangani tiga state: unchanged, changed, cleared. Clear harus melepas claim lama jika owner cocok. Untuk changed, gunakan Lua/transaction atau compensating rollback yang menghapus claim baru bila write user gagal. Tambahkan E2E untuk change, collision, clear, dan simulated write failure.

### R8-03 · P2 — Cooldown email dapat mengembalikan challenge yang tidak pernah dibuat

Alur saat ini mengklaim cooldown lebih dulu (`app/api/auth/verify/request/route.ts:29`), baru membuat active challenge (`:37`). Request kedua di antara dua langkah itu melihat cooldown, tidak menemukan active pointer, lalu mengembalikan random `challengeId` dengan HTTP 200 (`:30-35`). State yang sama muncul bila pembuatan challenge gagal setelah cooldown berhasil.

Audit targeted menghapus active pointer sambil mempertahankan cooldown untuk meniru state tersebut. Request berikutnya mengembalikan:

- HTTP **200**
- `sent: true`
- `reused: false`
- challenge acak yang tidak ada di datastore

Pengguna kemudian masuk ke layar kode, tetapi tidak ada kode yang dapat menyelesaikan challenge itu. Ini bukan lockout satu jam, tetapi tetap false success dan recovery buruk.

**Perbaikan.** Simpan candidate challenge dahulu, lalu gunakan active pointer/cooldown sebagai election key atomik. Pemenang mengirim email; pihak yang kalah membaca challenge pemenang yang sudah pasti ada. Jika pengiriman gagal, hapus election pointer dan candidate agar retry berikutnya benar-benar mengirim. Tambahkan concurrency test request-code dan test provider failure + immediate retry.

### R8-04 · P3 — Bukti offboarding dan failure heartbeat masih best-effort

Security decision tetap diterapkan walau audit write gagal (`lib/auth.ts:210-218`). Ini pilihan fail-safe yang benar untuk akses, tetapi berarti klaim “audit menjadi bukti offboarding” tidak selalu benar.

Heartbeat cron juga disimpan di Redis yang sama dengan pekerjaan cleanup. Bila penyebab failure adalah Redis unavailable, `recordCronRun` menelan kegagalan penulisan (`lib/cron-status.ts:20-22`). Admin hanya akan melihat heartbeat lama menjadi stale, bukan event failed baru.

**Perbaikan.** Kirim hasil offboarding dan cron ke kanal observability terpisah—Vercel log drain, error tracker, atau monitoring webhook—dengan alert. Audit Redis tetap berguna, tetapi jangan menjadi satu-satunya bukti.

### R8-05 · P3 — Dokumentasi utama sudah selaras, dua wording operasional tertinggal

README, product reference, readiness, dan severity sudah memakai klasifikasi yang sama. Dua wording perlu dirapikan:

- Runbook weekly check masih meminta “gated redirect”, padahal redirect publik.
- Launch gate menyebut public catalog tidak boleh membawa affiliate URL tanpa menegaskan bahwa yang dimaksud adalah endpoint katalog teragregasi, bukan endpoint link individual.

Risikonya kecil, tetapi runbook insiden harus bebas ambiguitas.

### R8-06 · P3 — Angka QA hijau, coverage closure belum seimbang

Dua scenario baru berfokus pada offboarding dan OTP concurrency. Belum ada test baru untuk:

- grant admin dengan strong/weak verification;
- perubahan, pengosongan, dan rollback nomor WhatsApp;
- race request-code/cooldown;
- migrasi counter attribution;
- cron failed/stale state;
- verification upgrade melalui flow nyata.

Suite juga tetap Chromium-only, tanpa WebKit, visual regression, performance budget, atau synthetic production lifecycle. Ini konsisten dengan R7-10 yang masih terbuka.

### R8-07 · P3 — Pencarian admin tetap full-scan

R7-09 tetap terbuka. Pada cache miss, pencarian creator dan sample mengambil seluruh collection ke server memory. Belum menggigit pada skala sekarang, tetapi tetapkan trigger—misalnya 10 ribu record atau p95 search di atas 500 ms—agar pekerjaan dilakukan berdasarkan bukti, bukan tebakan.

## Skor tertimbang

| Area | Bobot | Skor | Kontribusi | Penentu |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 7,3 | 1,17 | Revocation kuat; unverified admin grant masih P1 |
| Functional correctness | 14% | 8,7 | 1,22 | Jalur utama stabil; phone/cooldown edge state |
| Automated QA | 12% | 9,3 | 1,12 | 5/5, 14 unit, 49 executions; coverage baru masih sempit |
| Reliability & operations | 10% | 8,0 | 0,80 | Heartbeat dan runbook membaik; observability satu datastore |
| Data integrity | 10% | 7,7 | 0,77 | Metrik konsisten; claim phone dan 50 sel sumber |
| UX & conversion | 10% | 8,5 | 0,85 | Journey jelas; false-success cooldown perlu ditutup |
| Performance | 8% | 8,8 | 0,70 | Region tepat; belum ada budget/p95 gate |
| Accessibility | 6% | 8,2 | 0,49 | Axe critical/serious hijau; belum WebKit/target-size penuh |
| SEO & discovery | 5% | 9,0 | 0,45 | SSR, sitemap, canonical, OG sehat |
| Visual identity | 5% | 7,2 | 0,36 | Sistem kuat; logo masih sekitar setengah katalog |
| Trust & proof | 4% | 6,0 | 0,24 | Belum ada settlement proof |
| **Total** | **100%** |  | **8,1/10** |  |

## Improvement plan

### Gelombang 0 — containment sebelum perubahan env admin

1. Export daftar akun `role=admin` beserta email dan `verificationSource`.
2. Cocokkan dengan `ADMIN_EMAILS` production.
3. Untuk source `grandfathered/migrated`, jangan tambah atau pertahankan grant tanpa verifikasi ulang.
4. Bekukan penambahan admin baru sampai R8-01 selesai.

**Exit:** setiap admin allowlisted memiliki source `code/google`, dan tidak ada akun lemah yang dapat memperoleh 200 dari API admin.

### Gelombang A — blocker sebelum deploy · 1 hari

1. **R8-01:** strong-proof admin authorization + grant/revoke E2E.
2. **R8-02:** phone clear + rollback/transaction + empat test state.
3. **R8-03:** atomic challenge election + provider-failure recovery test.
4. Rapikan dua wording runbook R8-05.
5. Jalankan `npm run qa` lima kali setelah patch.

### Gelombang B — observability dan coverage · 1–3 hari

1. Kirim admin grant/revoke dan cron outcome ke observability di luar Redis.
2. Tambahkan test attribution migration, cron failed/stale, dan verification upgrade end-to-end.
3. Tambahkan WebKit mobile sebagai gate terpisah; stabilkan sebelum menjadikannya merge-blocking.
4. Tambahkan performance budget untuk HTML/API size, TTFB synthetic, dan p95 dari production monitoring.

### Gelombang C — trigger skala, bukan tambalan sekarang

Implementasikan secondary index/search ketika salah satu terpenuhi:

- creator atau sample request mencapai 10 ribu record;
- p95 pencarian admin melewati 500 ms;
- memory fungsi atau latency full-scan muncul di monitoring.

### Gelombang D — launch dependencies dan bukti bisnis

1. Aktifkan dan verifikasi Resend production.
2. Aktifkan `tap.haluandigital.agency`, redirect, canonical, dan smoke.
3. Tetapkan owner, SLA, quota, serta eskalasi sample TikTok/Shopee.
4. Tutup 50 sel bermasalah pada 35 brand atau beri owner/tenggat per pengecualian.
5. Naikkan coverage logo di atas 85%.
6. Tetapkan retention schedule dan proses export/delete.
7. Selesaikan satu closed-beta campaign sampai settlement yang dapat diaudit.

## Gate rilis berikutnya

| Gate | Status |
|---|---|
| QA 5× berturut-turut | **Terpenuhi** |
| OTP single-use concurrency | **Terpenuhi** |
| Admin langsung kehilangan privilege setelah keluar allowlist | **Terpenuhi** |
| Admin baru wajib membuktikan email | **Belum** |
| Phone index konsisten untuk change/clear/failure | **Belum** |
| Request-code tidak pernah mengembalikan challenge palsu | **Belum** |
| Link exposure docs bebas wording lama | Hampir |
| WebKit/visual/performance/synthetic | **Belum** |
| Custom domain dan email production | **Belum** |
| Data exception memiliki owner/tenggat | **Belum** |
| Settlement proof dapat diaudit | **Belum** |

## Kesimpulan

Klaim “delapan dari sepuluh tertutup” terlalu optimistis. Penilaian yang lebih akurat adalah **lima tertutup penuh, tiga parsial, dua tetap backlog**, dengan satu P1 baru pada jalur pemberian admin.

Batch ini sudah jauh lebih kuat daripada putaran 7, terutama pada offboarding, OTP, metrik, dan cron visibility. Setelah R8-01 sampai R8-03 ditutup, skor realistis naik ke sekitar 8,8. Nilai di atas 9 tetap bergantung pada coverage lintas browser, dependency production, data hygiene, dan bukti bisnis—bukan hanya tambahan test hijau.
