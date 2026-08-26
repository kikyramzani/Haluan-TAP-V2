# TAP by Haluan — QC/QA Depth Review, Putaran 11

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,5/10**

Review independen atas Gelombang A putaran 10. Saya membaca seluruh keluarga writer, menjalankan `npm run qa` lima kali, menguji dua failure path yang tidak ada di suite, dan memeriksa dua host production.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Closed beta pada deployment Vercel yang sekarang | **GO WITH STRICT CONDITIONS** | Baseline live lulus smoke 9/9. Batasi edit profil multi-tab sampai remediasi ini dipromosikan. |
| Promosi working tree | **HOLD** | Tiga P2 masih terbuka: lock bukan compare-and-delete, recovery saga kedaluwarsa sebelum cron, dan OTP dapat habis sebelum mutasi memperoleh lock. |
| Peluncuran lewat custom domain | **NO-GO saat audit** | `tap.haluandigital.agency` tidak resolve dan smoke menghasilkan 0/9. Host Vercel tetap sehat. |
| Paid acquisition | **NO-GO** | Selain tiga P2, `unprovenAdmins`, provider email, synthetic flow, dan bukti settlement belum memenuhi gate. |
| Pengecualian admin legacy | **Tetap disetujui bersyarat** | Syarat “kosong sebelum paid acquisition” ada, tetapi tenggat tertulis yang diminta board belum ada. |

## Ringkasan board

Koreksi arsitektur dari putaran 10 diikuti dengan baik. Seluruh writer yang disebut memang masuk ke primitive bersama dan membaca ulang record di dalam critical section. PATCH parsial benar-benar tertutup. Registrasi yang kalah reservasi gagal tertutup, pointer challenge memeriksa id, dan audit grant dibatasi satu kali per jam.

Namun dua klaim utama Gelombang A terlalu kuat:

1. Pelepasan lock melakukan `GET`, lalu `DEL` pada permintaan terpisah. Itu **bukan compare-and-delete**. Setelah TTL habis, holder lama dapat menghapus lock holder baru.
2. Intent nomor hidup 15 menit, sedangkan cron berjalan sekali sehari. Recovery otomatis hanya punya jendela lima menit setelah intent dianggap stale; biasanya intent sudah hilang jauh sebelum sweep berikutnya.

Probe tambahan menemukan efek ketiga. Endpoint reset menghapus challenge sebelum `resetUserPassword` mencoba mengambil lock. Saat lock sibuk, kode valid menghasilkan 500, challenge hilang, dan percobaan ulang menghasilkan 400. Jadi kontrol konkurensi baru mengubah transient conflict menjadi hilangnya bukti OTP.

Skor naik dari 8,4 menjadi 8,5 karena T10-02, sebagian besar T10-03–T10-05, perluasan writer, dan dua skenario E2E baru adalah kemajuan nyata. Kenaikan berhenti di sana karena inti lock dan recovery belum memenuhi invariant yang didokumentasikan.

## Bukti yang saya jalankan sendiri

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | **5/5 exit 0** |
| E2E | **76/76 per run**, 380 eksekusi total |
| Unit test | **14/14 per run**, 70 eksekusi total |
| Dependency audit | **0 vulnerability** pada kelima run |
| Build, TypeScript, lint | lulus pada kelima run |
| `git diff --check` | lulus |
| Skenario unik | 23 deklarasi `test(...)` + 7 rute accessibility = **30** |
| Sebaran | 29 mobile Chromium, 29 desktop Chromium, 17 mobile WebKit, 1 legacy-auth |

Kenaikan 72 → 76 adalah dua skenario unik yang masing-masing berjalan pada dua profil Chromium. Ini cakupan baru yang sah, bukan pengulangan run.

### Probe adversarial

**OTP saat lock user sibuk**

```text
permintaan pertama: 500 · Kata sandi belum dapat diubah
challenge sesudahnya: null
permintaan ulang dengan kode yang sama: 400 · kode salah atau kedaluwarsa
```

**Saga setelah intent hilang atau kedaluwarsa**

```text
record phone: …119
claim …110: masih menunjuk user  ← yatim
claim …119: menunjuk user
cron: phoneClaimsRepaired = 0
phone-intents ZSET: tetap 1 anggota mati
```

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke `haluan-tap.vercel.app` | **9/9** |
| Health | `ready` |
| Region | `sin1::sin1` |
| TTFB homepage, 3× | 0,164–0,227 detik |
| Katalog | 310 TikTok · 383 Shopee |
| CSP dan canonical | hadir; canonical memakai host Vercel yang resolve |
| Smoke `tap.haluandigital.agency` | **0/9**, DNS tidak resolve |

Kegagalan custom domain adalah blocker aktivasi eksternal, bukan regresi working tree. Dokumentasi memang masih menempatkan aktivasi DNS pada antrean.

## Temuan

### R11-01 · P2 — Primitive lock belum aman terhadap pergantian holder

`lib/mutation.ts:41–42` membaca token dengan `GET`, kemudian menghapus key dengan `DEL`. Di antara dua operasi itu, TTL lima detik dapat habis dan request lain dapat memperoleh lock. `DEL` holder lama lalu menghapus lock baru. Selain itu, lease tidak diperpanjang; operasi yang melewati lima detik kembali berjalan bersamaan meski pelepasannya nanti diperbaiki.

Komentar kode dan improvement plan menyebutnya compare-and-delete, tetapi implementasinya bukan operasi atomik. Pola `GET` lalu `DEL` yang sama ada pada pelepasan pointer email dan claim nomor, sehingga pemeriksaan ownership-nya juga rentan terhadap TOCTOU.

**Perbaikan.** Gunakan compare-and-delete atomik di datastore, lalu lindungi lease overrun dengan renewal atau fencing/version check pada penulisan. Tambahkan kemampuan yang dibutuhkan ke mock; keterbatasan mock bukan alasan untuk menurunkan invariant production.

**Selesai bila.** Holder lama tidak dapat menghapus lock atau claim penerus, termasuk ketika TTL habis tepat di antara pemeriksaan token dan penghapusan.

### R11-02 · P2 — Jurnal saga hilang sebelum sweep recovery

`lib/auth.ts:385` memberi TTL 900 detik pada intent. `reconcileStalePhoneClaims` baru memilihnya setelah sepuluh menit, sedangkan `vercel.json` menjadwalkan cron sekali sehari. Recovery otomatis karena itu memiliki jendela efektif sekitar lima menit; proses yang mati setelah klaim atau penulisan record dapat meninggalkan divergence hampir satu hari, lalu kehilangan data `from/to` sebelum cron membaca.

Ketika intent sudah hilang, `reconcilePhoneClaims` langsung mengembalikan `false` dan tidak membersihkan anggota ZSET. Probe membuktikan klaim yatim dan anggota indeks mati bertahan setelah cron.

Ada dua partial-write tambahan: `SET intent` dan `ZADD` dibuat lewat `Promise.all`, begitu juga `DEL intent` dan `ZREM`. Salah satu operasi dapat berhasil sendiri. Ini tidak selalu merusak record, tetapi membuktikan journal discovery belum durable.

**Perbaikan.** Tulis intent dan discovery index sebagai journal atomik, simpan sampai melewati interval cron dan toleransi outage, serta bersihkan anggota indeks yang kehilangan payload. Uji kegagalan setelah setiap fase: journal, claim baru, record, pelepasan claim lama, dan cleanup journal.

**Selesai bila.** Setiap fase yang terputus dapat diselesaikan cron berikutnya; tidak ada claim yatim dan tidak ada anggota indeks tanpa intent.

### R11-03 · P2 — OTP dihabiskan sebelum mutasi memperoleh lock

`password/reset` dan `verify/confirm` memanggil `consumeEmailChallenge` sebelum writer user. Jika writer gagal memperoleh lock, endpoint mengembalikan 500 tetapi `DEL` challenge sudah berhasil. Pengguna harus meminta kode baru meski memasukkan kode yang benar.

Ini bukan spekulasi. Probe reset dengan lock user yang sengaja ditahan menghasilkan urutan 500 → challenge `null` → 400 pada retry.

**Perbaikan.** Validasi awal boleh dilakukan tanpa lock, tetapi ambil lock user sebelum konsumsi destruktif, lalu validasi ulang dan konsumsi challenge di dalam critical section yang sama dengan mutasi. Hindari lock reentrant dengan fungsi internal yang menerima lock yang sudah dimiliki. Konflik sebelum konsumsi harus menghasilkan 409/503 retryable tanpa membakar kode.

**Selesai bila.** Lock contention pada verify dan reset tidak menghapus challenge; retry dengan kode yang sama berhasil setelah lock tersedia.

### R11-04 · P3 — Kontrak “setiap konflik → 409” tidak benar

Runbook menyatakan semua caller mendapat 409. Hanya profil dan update sample yang memetakan `MutationConflictError` ke 409. Update membership menangkap semua error sebagai 404; reset dan verifikasi menjadi 500; jalur Google, rekonsiliasi admin, cleanup, dan rollback registrasi punya perilaku lain.

**Perbaikan.** Tetapkan kontrak per endpoint: 409 untuk mutasi interaktif yang aman diulang, retry internal untuk pekerjaan sistem, dan rollback yang terukur untuk registrasi. Setelah itu, samakan runbook dengan perilaku aktual.

### R11-05 · P3 — Cakupan baru belum menguji invariant primitive

Tes paralel baru hanya mengirim dua nomor berbeda. Ia menjaga field lama, tetapi belum mengulangi probe dua writer yang sama-sama mengubah field berbeda. Suite juga tidak menguji expiry lock, takeover holder, failure phase saga, intent tanpa payload, kontensi OTP, konflik membership/sample, atau auth di WebKit.

**Perbaikan.** Tambahkan tes invariant di bawah Gelombang A dan satu auth smoke WebKit di Gelombang B. Gunakan failure injection pada mock datastore agar jalur crash dapat diuji deterministik.

### R11-06 · P3 — Tenggat pengecualian admin legacy belum tertulis

Runbook mewajibkan daftar `unprovenAdmins` kosong sebelum paid acquisition, tetapi belum mencatat tanggal atau SLA relatif yang disetujui board. Tambahkan pemilik dan tenggat, misalnya maksimal 24 jam setelah Resend aktif, plus tindakan otomatis bila lewat.

## Penilaian klaim Gelombang A

| Klaim | Penilaian |
|---|---|
| Seluruh writer memakai primitive bersama dan re-read di dalam lock | **Terkonfirmasi.** Cakupan writer sesuai laporan. |
| Pelepasan lock memakai compare-and-delete | **Tidak benar.** Implementasinya `GET` lalu `DEL`. |
| Konflik selalu menjadi 409 | **Tidak benar.** Hanya dua endpoint yang memetakannya. |
| Saga menutup divergence yang bertahan | **Tidak benar.** TTL 15 menit lebih pendek dari jadwal cron harian; probe gagal memperbaiki. |
| PATCH parsial tertutup | **Terkonfirmasi.** Route dan E2E tepat. |
| Registrasi kalah reservasi fail closed | **Terkonfirmasi secara kode.** Failure-path spesifik belum punya tes. |
| Pointer challenge ownership-safe | **Secara logis ya, secara atomik belum.** Masih `GET` lalu `DEL`. |
| `admin.grant_blocked` dibatasi satu jam | **Terkonfirmasi.** |
| Gate 5/5, 76 E2E, 14 unit, 0 vulnerability | **Terkonfirmasi secara independen.** |

## Skor

Model bobot sama dengan putaran 9–10.

| Area | Bobot | Skor | Kontribusi | Yang menentukan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 8,9 | 1,42 | Grant/revocation dan OTP single-use kuat; admin legacy dan pointer non-atomik tetap terbuka. |
| Functional correctness | 14% | 8,6 | 1,20 | PATCH parsial selesai; kode OTP benar masih dapat gagal permanen saat lock sibuk. |
| QA depth | 12% | 9,5 | 1,14 | 5×76 stabil, 30 skenario unik, dua engine; failure injection dan auth WebKit belum ada. |
| Reliability | 10% | 7,4 | 0,74 | Lease lima detik tanpa renewal dan sweep saga tidak dapat memenuhi recovery promise. |
| Data integrity | 10% | 7,4 | 0,74 | Lost update happy path jauh lebih baik; claim yatim tetap dapat bertahan setelah crash. |
| UX | 10% | 8,9 | 0,89 | PATCH aman; transient contention dapat memaksa pengguna meminta OTP baru. |
| Performance | 8% | 8,8 | 0,70 | Snapshot production baik; belum ada budget atau p95 historis. |
| Accessibility | 6% | 8,8 | 0,53 | Axe dua engine; belum ada screen reader/manual pass. |
| SEO | 5% | 8,6 | 0,43 | Canonical Vercel hidup; custom domain yang didokumentasikan belum resolve. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix ada; visual regression belum tersedia. |
| Trust & proof | 4% | 6,5 | 0,26 | Provider, settlement, dan bukti bisnis belum lengkap. |
| **Total** | **100%** |  | **8,46 → 8,5/10** |  |

## Improvement plan

### Gelombang A1 — sebelum promosi · ±1 hari

1. **R11-01:** atomic compare-and-delete untuk lock, pointer email, dan claim nomor; tambahkan lease renewal atau fencing.
2. **R11-02:** journal saga durable dan atomik; TTL melewati jadwal cron plus toleransi outage; bersihkan orphan index.
3. **R11-03:** lock sebelum konsumsi OTP; retry tidak membakar challenge.
4. **R11-04:** satu kontrak error/retry per caller dan dokumentasi yang akurat.
5. Tambahkan failure injection dan tes seluruh phase boundary di atas.

### Gelombang A2 — gate promosi · ±½ hari

6. Dua writer paralel dengan field berbeda harus mempertahankan kedua perubahan atau memberi satu 409 yang aman diulang.
7. Uji expiry/takeover lock: holder lama tidak pernah menghapus holder baru.
8. Uji verify dan reset saat lock sibuk, lalu retry dengan challenge yang sama.
9. Uji saga terputus pada kelima fase dan cron menyelesaikan semuanya.
10. Jalankan `npm run qa` lima kali, `git diff --check`, lalu review diff terakhir sebelum promosi.

### Gelombang B — QA dan aktivasi

11. Auth smoke WebKit: daftar, verifikasi, dashboard, logout, login.
12. Visual regression enam permukaan utama.
13. Performance budget TTFB dan transfer size.
14. Synthetic production flow dengan akun non-admin khusus.
15. Aktifkan Resend dan custom-domain DNS; smoke custom domain wajib 9/9.

### Gelombang C — sebelum paid acquisition

16. `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif; catat owner dan tindakan saat SLA lewat.
17. Satu closed-beta campaign selesai sampai settlement dengan bukti yang dapat diaudit.
18. Tutup gap campaign, logo, masa berlaku, dan intake sample yang sudah tercatat.

Trigger indeks pencarian admin tetap: **10.000 record atau p95 endpoint admin >500 ms**, mana lebih dulu.

## Gate penerimaan berikutnya

1. Tiga P2 R11-01 sampai R11-03 tertutup dan direproduksi balik.
2. Tidak ada dokumentasi yang menyebut `GET` + `DEL` sebagai compare-and-delete.
3. Recovery saga terbukti setelah intent melewati satu jadwal cron penuh.
4. OTP yang benar tidak habis pada transient conflict.
5. Lima gate QA hijau setelah semua perubahan, bukan sebelum perubahan terakhir.
6. Host Vercel dan custom domain masing-masing smoke 9/9 sebelum aktivasi domain.

## Cara verifikasi dijalankan

- `npm run qa` lima kali berturut-turut, tanpa retry manual: exit 0 semua.
- Dua probe lokal memakai build production dan mock datastore: lock contention OTP dan intent saga yang hilang.
- `npm run smoke:production` dijalankan pada kedua host.
- Writer user, sample, route error mapping, TTL, cron schedule, pointer challenge, dan dokumentasi ditelusuri langsung.
- Tidak ada source code produk yang diubah oleh audit; hanya laporan dan improvement plan diperbarui.
