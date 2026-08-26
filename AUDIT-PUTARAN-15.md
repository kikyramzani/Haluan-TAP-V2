# TAP by Haluan — QC/QA Depth Review, Putaran 15

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,1/10**

Review independen atas pohon kerja yang sama dengan putaran 14. Saya mereproduksi sendiri temuan P1-nya, memverifikasi lima temuan lain, dan menemukan satu jalur kegagalan yang belum tercatat.

---

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Production Vercel saat ini | **GO** | Cacat receipt tidak ada di production. Production berjalan pada `215a1bf`, yang mendahului seluruh pekerjaan receipt, dan verifikasi email di sana **503** karena provider belum aktif — jalur OTP-nya tidak dapat dicapai sama sekali |
| Promosi working tree | **HOLD** | Ada cacat pada batas autentikasi. Bukan soal ukuran perbaikan, soal jenisnya |
| Desain receipt OTP | **Ditolak** | Sependapat dengan board. Perbaikannya bukan menambal receipt, tetapi mencabut kemampuannya menghasilkan session |
| Custom domain | **NO-GO** | `tap.haluandigital.agency` tidak resolve saat audit |
| Paid acquisition | **NO-GO** | `unprovenAdmins` belum nol, bukti settlement belum ada |

---

## Ringkasan

Receipt OTP adalah kesalahan desain saya, dan jenisnya perlu dinamai dengan tepat: **saya menempatkan idempoten di lapisan yang salah.** Fungsi auth mengembalikan record user baik untuk commit baru maupun untuk pengulangan, dan route selalu memanggil `createSession` atas nilai balik itu. Akibatnya konsumsi kode berhenti mengakhiri kekuatan kode tersebut.

Sebelum ada receipt, satu kode sekali pakai memang sekali pakai. Setelah ada receipt, kode yang sudah dipakai menjadi **primitive pencetak session** selama 30 menit.

Saya reproduksi sendiri, dan hasilnya sama dengan probe board:

```
session setelah verifikasi: 1
reset pertama: 200 | session: 1
  replay 1: 200 | session: 2
  replay 2: 200 | session: 3
  replay 3: 200 | session: 4
replay dengan password berbeda: 200
  login memakai password itu: 401
```

Satu nuansa yang layak dicatat karena mengubah cara membaca risikonya: **password-nya tidak berubah** pada replay — login dengan password berbeda tetap 401. Jadi ini bukan primitive pengubah password; ini primitive pencetak session yang menerima payload apa pun. Batas atasnya bukan "dibatasi rate limit" secara umum, melainkan **30 session per kode** (batas per challenge) atau 10 per jam per IP.

---

## Bukti yang saya jalankan sendiri

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | 5/5 exit 0 (putaran sebelumnya, tidak diubah sejak itu) |
| E2E per run | 86 lolos |
| Unit/security per run | 15 lolos |
| Dependency audit | 0 vulnerability |
| `git diff --check` | lulus |

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke | **9/9** |
| Commit yang tayang | `215a1bf` — mendahului seluruh pekerjaan receipt |
| `POST /api/auth/verify/request` | **503** — provider email belum aktif, jalur OTP tidak dapat dicapai |
| TTFB homepage (3×) | 0,187 – 0,223 detik |
| Custom domain | tidak resolve |

Ini yang membuat keputusan production tetap GO: cacat P1 hidup **hanya** di working tree, dan bahkan bila dipromosikan hari ini ia belum aktif sampai Resend dinyalakan. Urutan penyalaan menjadi penting: perbaikan receipt harus mendahului aktivasi email, bukan sebaliknya.

---

## Penilaian atas keenam temuan putaran 14

| Temuan | Penilaian | Catatan |
|---|---|---|
| R14-01 · receipt mencetak session | **Setuju, terbukti** | Direproduksi: 1 → 4 session. Tambahan dari saya: password tidak berubah, dan plafonnya 30 session per kode |
| R14-02 · verification index di luar commit | **Setuju** | `SET` claim email/phone dilakukan setelah script; kegagalannya menyisakan TTL registrasi 30 menit sehingga `findUserByEmail` berhenti menemukan record |
| R14-03 · challenge JSON tertinggal | **Setuju** | Script hanya menghapus guard; penghapusan JSON best-effort. Retry lolos `peekEmailChallenge`, script menjawab `challenge_spent`, caller mengembalikan null tanpa memeriksa receipt |
| R14-04 · takeover test tidak melakukan takeover | **Setuju** | Tes hanya menggagalkan EVAL pertama sebagai error transport; tidak pernah membuat script mengembalikan `lock_lost` |
| R14-05 · celah harness | **Setuju** | Diverifikasi di kode: `/__reset` membersihkan values, expiries, sortedSets, dan emails — **tidak** membersihkan `failures`. Probe runtime saya sendiri tidak menangkapnya justru karena rule-nya tersedot oleh command lain di antaranya; itu persis bentuk kebocorannya |
| R14-06 · dependency error membership → 404 | **Setuju** | Catch sisanya masih selalu 404 |

Keenamnya valid. Tidak ada yang saya turunkan atau bantah.

---

## Temuan tambahan

### T15-01 · P2 — Strictness putaran 13 menciptakan jalur 500 setelah commit

Belum tercatat di putaran 14, dan justru memperkuat R14-03.

Di putaran 13 saya membuat `deleteIfEquals` melempar, karena menelan error adalah akar kegagalan saga nomor. Perubahan itu benar untuk saga. Tetapi `releaseEmailSend` memakai helper yang sama, dan ia dipanggil di blok pembersihan **setelah** commit OTP:

```
await Promise.all([
  discardEmailChallenge(challengeId),                     // menelan error
  releaseEmailSend("verify", user.email, challengeId),    // sekarang melempar
  redis("SET", key("email", user.email), pending.userId),
  ...
]);
```

Jadi satu error transient saat melepas pointer mengubah verifikasi yang **sudah berhasil** menjadi 500. Dan karena penghapusan JSON challenge bersifat best-effort, retry berikutnya jatuh tepat ke jalur false-400 di R14-03.

Dengan kata lain: alasan receipt dibuat — kegagalan pembersihan setelah commit — justru menjadi lebih mudah terjadi setelah perubahan strictness, sementara receipt tidak menutupnya.

**Perbaikan.** Pembersihan setelah commit harus best-effort secara eksplisit: pakai `tryDeleteIfEquals` di `releaseEmailSend` ketika dipanggil dari jalur post-commit, atau pisahkan menjadi dua fungsi dengan nama yang menyatakan maksudnya. Yang strict tetap dipakai di saga dan di `deletePendingUser`, tempat kegagalan memang harus muncul.

### T15-02 · P3 — Replay tidak mengembalikan hasil asli, hanya record-nya

`verifyEmailWithChallenge` pada jalur replay mengembalikan record user langsung dan **melewati `reconcileAdminRole`**, padahal commit pertama menjalankannya. Untuk operator yang ada di allowlist, replay menghasilkan session tanpa promosi yang seharusnya menyertainya — pulih sendiri pada permintaan admin berikutnya, tetapi menunjukkan bahwa receipt tidak benar-benar mengembalikan "hasil yang sama".

Ini melemahkan klaim invariant receipt, dan sebaiknya diselesaikan bersama perbaikan R14-01: bila replay tidak lagi mencetak session, kontraknya harus dinyatakan sebagai *acknowledgment commit*, bukan *pengulangan hasil*.

---

## Skor

| Area | Putaran 10 (saya) | Sekarang | Yang menentukan |
|---|---:|---:|---|
| Security & privacy | 9,5 | **7,5** | Kode sekali pakai kehilangan sifat sekali pakai pada batas autentikasi; regresi yang saya perkenalkan sendiri |
| Data integrity | 7 | **7** | Verification index di luar commit dapat membuat user verified tidak ditemukan lewat email |
| Automated QA | 9,5 | **8,5** | 86 E2E dua engine dengan failure injection, tetapi assertion longgar dan `failures` tidak direset membuat sebagian tes bisa lulus tanpa fault-nya pernah terjadi |
| Product clarity | 9 | **8,5** | False 200 pada replay dengan password berbeda adalah jawaban yang tidak benar kepada pengguna |
| Conversion journey | 8,5 | **8,5** | Tidak berubah |
| Operational readiness | 8,5 | **8,5** | Runbook kontrak konflik dan kegagalan sudah kuat |
| SEO & discovery | 9 | **9** | Tidak berubah |
| Performance | 9 | **9** | TTFB 0,19–0,22 detik |
| Mobile discovery | 9,5 | **9,5** | Tidak berubah |
| Visual identity | 7 | **7** | Cakupan logo 50% dan 57% |
| Trust & proof | 6 | **6** | Belum ada bukti settlement |
| **Rata-rata** | **8,4** | **8,1** | Satu regresi pada batas autentikasi menurunkan lebih banyak daripada kenaikan reliabilitas |

Skor saya 8,1, di bawah 8,5 dari board. Selisihnya disengaja: saya memberi bobot lebih berat pada cacat batas autentikasi daripada pada jumlah temuan, dan saya menambahkan satu jalur kegagalan (T15-01) yang belum masuk hitungan. Saya menilai regresi ini keras justru karena saya yang membuatnya.

---

## Improvement plan

Handoff putaran 14 sudah memuat work package A–G, matriks 32 skenario, dan gate promosi. Saya tidak menduplikasinya. Yang berikut adalah urutan yang saya rekomendasikan, ditambah dua item dari audit ini.

### Sebelum promosi · ±1–1½ hari

1. **Cabut kemampuan replay mencetak session** (handoff A dan B). Fungsi auth harus membedakan `committed` dari `replayed`; route hanya membuat session pada `committed`. Replay mengembalikan acknowledgment yang mengarahkan ke login. Ini yang mengembalikan sifat sekali pakai pada kode.
2. **Ikat receipt pada purpose dan payload** (handoff A). Receipt verify tidak boleh diterima di endpoint reset, dan replay reset hanya sukses bila password yang dikirim cocok dengan yang benar-benar committed.
3. **Masukkan verification index ke dalam script commit** (handoff C). Claim email dan phone permanen, penghapusan pending-index member, penghapusan challenge JSON **dan** guard — satu operasi. Bila claim sudah dimiliki akun lain, kode jangan dikonsumsi.
4. **T15-01 · pisahkan pembersihan best-effort dari yang strict.** Tanpa ini, jalur 500-setelah-commit tetap ada dan justru memicu kondisi yang receipt-nya sendiri gagal tangani.
5. **T15-02 · nyatakan kontrak replay.** Bila replay tidak mencetak session, ia adalah acknowledgment; hilangkan kesan bahwa ia mengulang seluruh hasil, termasuk rekonsiliasi admin.
6. **Perbaiki harness** (handoff F): `/__reset` membersihkan `failures`; setiap fault test mengassert fault benar-benar terpanggil dan status awal tepat; tambahkan `TTL`/`PTTL` agar klaim permanen dapat dibuktikan; tambahkan takeover action yang benar-benar menukar token lock.
7. **Kontrak error** (handoff G): hanya `USER_NOT_FOUND` menjadi 404; error datastore 500/503; inline phone reconciliation lewat `session.commit`.

### Gate promosi

Selain matriks 32 skenario di handoff, tiga hal yang saya anggap tidak bisa ditawar:

- Replay kode yang sudah dipakai **tidak menambah session** — dibuktikan dengan menghitung anggota `user:{id}:sessions` sebelum dan sesudah.
- Receipt verify **ditolak** di endpoint reset, dan sebaliknya.
- Kegagalan pembersihan setelah commit menghasilkan **retry yang sukses**, bukan 500 lalu 400.

### Setelah promosi

Urutan penyalaan penting: **perbaikan receipt lebih dulu, Resend sesudahnya.** Selama email belum aktif, jalur OTP di production tidak dapat dicapai, dan itu satu-satunya alasan cacat ini belum menjadi insiden. Menyalakan Resend sebelum perbaikan akan membalik urutan itu.

Sisanya tidak berubah: auth smoke WebKit, visual regression, performance budget, synthetic production flow, DNS custom domain, lalu `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif.

---

## Cara verifikasi dijalankan

- Probe replay dijalankan terhadap server lokal dengan mock datastore: registrasi, verifikasi, permintaan kode reset, satu reset sukses, tiga replay, lalu satu replay dengan password berbeda; jumlah anggota `user:{id}:sessions` dibaca langsung dari datastore pada setiap langkah.
- Login dengan password yang dipakai pada replay diuji untuk memastikan password tidak benar-benar berubah.
- `/__reset` pada mock dibaca di kode untuk memastikan `failures` tidak ikut dibersihkan; probe runtime tidak menangkapnya karena rule tersedot command lain — bentuk kebocoran itu sendiri.
- Jalur pembersihan setelah commit dibaca untuk kedua fungsi OTP guna melacak helper strict yang dipakai di tempat best-effort.
- Production diuji: smoke 9/9, commit yang tayang, status `verify/request`, TTFB 3×, dan resolusi custom domain.
