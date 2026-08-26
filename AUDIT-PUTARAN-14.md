# TAP by Haluan — QC/QA Depth Review, Putaran 14

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,5/10**

Audit independen atas remediasi dua P2 dan tiga P3 putaran 13. Review ini mencakup seluruh script Lua, lifecycle challenge dan receipt, session creation, phone saga, caller lock, targeted failure injection, lima quality gate penuh, probe adversarial pada build production lokal, dokumentasi operasi, serta dua host production.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Closed beta pada deployment Vercel saat ini | **GO WITH STRICT CONDITIONS** | Baseline live sehat dan belum memuat working tree. |
| Promosi working tree | **HOLD** | Receipt mengubah OTP yang sudah dipakai menjadi kredensial autentikasi ulang selama 30 menit. Ia juga tidak terikat purpose/payload dan belum membuat index verifikasi durable. |
| Peluncuran custom domain | **NO-GO saat audit** | `tap.haluandigital.agency` tetap tidak resolve; smoke 0/9. |
| Paid acquisition | **NO-GO** | Provider email, custom domain, synthetic production flow, dan bukti settlement belum memenuhi gate. |
| Phone-saga remediation | **DITERIMA** | Strict compare-and-delete, respons 500, intent retention, dan cron recovery terbukti pada fase release yang tepat. |
| Receipt remediation | **DITOLAK untuk promosi** | Receipt memang memulihkan satu jalur 500 → retry, tetapi membuka replay session, false success lintas purpose/payload, dan tidak menyelesaikan critical verification indexes. |
| Pengecualian admin legacy | **Tetap disetujui dan time-boxed** | Owner, trigger, SLA 24 jam, bukti, tindakan bila terlambat, dan hard gate sudah tertulis. |

## Executive summary

Perbaikan phone saga tepat sasaran. `deleteIfEquals` sekarang membedakan mismatch ownership dari kegagalan datastore: mismatch mengembalikan `false`, sedangkan error Redis melempar. Hanya release lease yang memakai varian best-effort. E2E juga sekarang menggagalkan key nomor lama secara spesifik, dua kali, kemudian menuakan intent sebelum menjalankan cron. Ini menutup reproduksi R13-01.

Receipt OTP bergerak ke arah yang benar pada level datastore: receipt ditulis di script yang sama dengan user record dan challenge guard. Namun boundary API-nya salah. Receipt hanya menyimpan `codeHash:userId`; ia tidak menyimpan purpose, fingerprint mutasi, atau status session. Kedua endpoint menerima receipt yang sama, mengembalikan 200, lalu selalu memanggil `createSession`.

Hasil probe:

- receipt verifikasi dipakai ulang tiga kali dan jumlah session naik dari 1 menjadi 4;
- receipt verifikasi diterima endpoint reset sebagai 200, walau password yang dikirim tidak diterapkan;
- reset yang committed dengan password A diulang memakai password B dan tetap mendapat 200, tetapi hanya A yang dapat login;
- verification commit yang gagal mempermanenkan email index dapat diulang menjadi 200 dari receipt, tetapi index tetap sementara dan login email gagal setelah TTL habis;
- jika JSON challenge gagal dibersihkan, receipt tidak dibaca sama sekali: retry menjadi 400 walaupun operasi pertama sudah committed.

Karena consumed OTP kembali dapat membuat session baru selama receipt hidup, ini bukan sekadar UX idempotency. Ia merupakan regression pada sifat one-time credential. Skor turun dari 8,7 menjadi 8,5 meski QA depth dan phone data integrity membaik.

## Bukti yang dijalankan

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | **5/5 exit 0** |
| E2E | **86/86 per run**, 430 eksekusi total |
| Unit test | **15/15 per run**, 75 eksekusi total |
| Dependency audit | **0 vulnerability** pada kelima run |
| Build, TypeScript, lint | lulus pada kelima run |
| `git diff --check` | lulus sebelum laporan ditulis |
| Skenario unik | 17 auth + 10 public + 7 accessibility + 1 legacy = **35** |
| Sebaran | 34 mobile Chromium · 34 desktop Chromium · 17 mobile WebKit · 1 legacy-auth |

Kenaikan 84 → 86 berasal dari satu tes baru yang berjalan pada dua profil Chromium: receipt reset setelah post-commit failure. Tes saga menggantikan skenario saga lama, bukan menambah satu deklarasi lagi.

### Probe receipt replay

```text
verify pertama: 200
verify replay: [200, 200, 200]
session sebelum replay: 1
session setelah replay: 4
```

Receipt tidak hanya mengembalikan acknowledgment. Setiap replay menjalankan `createSession` dan menambah session aktif.

### Probe purpose binding

```text
receipt dari challenge verify → endpoint password/reset: 200
login password lama: 200
login password yang diklaim baru: 401
```

Endpoint reset melaporkan sukses dan membuat session, tetapi tidak pernah melakukan reset. Receipt tidak membawa purpose dan early-return receipt melewati mutasi.

### Probe payload binding

```text
reset pertama, password A, commit mendarat lalu cleanup gagal: 500
replay kode yang sama, password B: 200
login password A: 200
login password B: 401
```

Receipt membuktikan bahwa *sebuah* operasi pernah committed, tetapi route melaporkannya seolah payload replay yang baru juga committed.

### Probe durability verification index

Saya menggagalkan tepat `SET tap:v1:email:index-gap@tap.test` setelah user record dan receipt committed, lalu memperpendek sisa TTL claim registrasi menjadi satu detik untuk mensimulasikan expiry.

```text
verify pertama: 500
replay receipt: 200
record user: tetap ada dan verified
email index setelah TTL: null
login email setelah TTL: 401
```

Receipt retry tidak menjalankan finalisasi index. Record dan lookup berpisah: user verified tetap ada, tetapi tidak dapat ditemukan lewat email.

### Probe stale challenge JSON

Saya menggagalkan tepat penghapusan JSON challenge setelah reset commit.

```text
reset pertama: 200
retry kode dan payload yang sama: 400
login password baru: 200
```

`peekEmailChallenge` masih menemukan JSON lama, sehingga alur masuk ke script, menerima `challenge_spent`, dan langsung mengembalikan null. Receipt hanya diperiksa jika `peek` sejak awal null.

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke `haluan-tap.vercel.app` | **9/9** |
| Health | `ready` |
| Region | `sin1::sin1` |
| TTFB homepage, 3× | 0,191–0,358 detik |
| Katalog | 310 TikTok · 383 Shopee |
| CSP dan canonical | hadir; canonical memakai host Vercel |
| Smoke `tap.haluandigital.agency` | **0/9**, DNS tidak resolve |

Production belum memuat working tree. Hasil 9/9 membuktikan baseline live, bukan receipt atau phone-saga remediation.

## Temuan

### R14-01 · P1 — Receipt membuat consumed OTP dapat mencetak session baru

Receipt disimpan selama 30 menit dan dibaca oleh `verifyEmailWithChallenge` maupun `resetPasswordWithChallenge` ketika challenge tidak ditemukan (`lib/auth.ts:124–129` dan `164–170`). Kedua route lalu selalu memanggil `createSession` (`verify/confirm:19`, `password/reset:21`).

Akibatnya, OTP tidak lagi one-time pada boundary autentikasi. Siapa pun yang memperoleh `challengeId + code` yang sudah dipakai masih dapat membuat session baru sampai receipt kedaluwarsa, dibatasi rate limit tetapi bukan dibatasi satu session atau satu replay.

Receipt juga hanya menyimpan `codeHash:userId` (`lib/email-auth.ts:65–76`). Tidak ada:

- purpose `verify` atau `reset`;
- fingerprint state yang committed;
- fingerprint payload reset;
- penanda apakah response awal sempat membuat session.

Itu menjelaskan dua false success: receipt verify diterima reset, dan retry reset dengan password berbeda tetap 200 walau password kedua tidak pernah ditulis.

**Keputusan.** Ini blocker promosi. Receipt harus menjadi acknowledgment commit, bukan kredensial untuk mengulangi efek autentikasi.

**Perbaikan minimum.** Receipt versi baru wajib membawa purpose dan fingerprint mutasi. Result dari fungsi auth harus membedakan `committed` dari `replayed`. Route hanya membuat session pada `committed`; replay mengembalikan acknowledgment yang mengarahkan user ke login tanpa membuat session baru. Reset replay hanya sukses bila password yang dikirim cocok dengan password hash yang benar-benar committed.

### R14-02 · P2 — Verification index masih di luar transaksi yang diotorisasi OTP

Script `commitWithChallenge` menulis user dan receipt, tetapi email index, phone index, dan pending index baru diproses setelah script (`lib/auth.ts:151–158`). Claim email/phone dari registrasi memiliki TTL 30 menit (`lib/auth.ts:46–52`).

Jika `SET` index gagal:

1. user sudah berstatus verified;
2. challenge guard sudah habis;
3. receipt sudah hidup;
4. claim awal tetap memakai TTL registrasi;
5. receipt replay hanya membaca user dan tidak mengulang finalisasi index.

Saat TTL claim habis, `findUserByEmail` tidak lagi menemukan record. Ini bukan housekeeping. Email dan phone ownership index merupakan bagian dari commit bisnis verifikasi.

**Perbaikan.** Gunakan script verify khusus yang memeriksa ownership index, menulis user dan receipt, menghapus challenge JSON/guard, membuat email/phone claim permanen, serta menghapus pending-index member dalam satu operasi. Jika claim sudah dimiliki user lain, jangan konsumsi challenge.

### R14-03 · P2 — Receipt tidak menangani challenge JSON yang tertinggal

Script hanya menghapus guard, bukan record JSON challenge (`lib/atomic.ts:9`). `discardEmailChallenge` menghapus JSON setelah commit dan sengaja menelan error (`lib/email-auth.ts:99–101`). Jika delete JSON gagal, retry masih lolos `peekEmailChallenge`. Script berikutnya mengembalikan `challenge_spent`, lalu caller mengembalikan null tanpa memeriksa receipt (`lib/auth.ts:149` dan `192`).

Receipt karena itu gagal pada salah satu cleanup failure yang seharusnya menjadi alasan receipt dibuat.

**Perbaikan.** Hapus challenge JSON di dalam script commit. Sebagai defense-in-depth, hasil `challenge_spent` tetap harus mencoba receipt dengan purpose dan payload yang cocok.

### R14-04 · P3 — Phase-targeted phone test benar, tetapi takeover test belum melakukan takeover

Tes saga baru menarget key old-phone yang tepat dan diterima. Namun tes bernama “lease yang berpindah setelah kode dibaca” masih hanya menggagalkan EVAL pertama sebagai error transport (`tests/e2e/auth-operations.spec.ts:493–497`). Ia tidak mengganti lock token dan tidak membuat script mengembalikan `lock_lost`.

Pada phone path, `updateProfile` juga menjalankan `reconcilePhoneClaims` langsung sebelum guarded commit dan di catch (`lib/auth.ts:449` dan `493`). Jika lease berpindah sebelum catch, holder lama masih dapat menyentuh intent penerus. Ini berada di area micro-window non-OTP yang sudah dinyatakan terbuka, tetapi cleanup stale-holder dapat ditutup tanpa memindahkan seluruh record mutation ke Lua.

**Perbaikan.** Jalankan inline reconciliation melalui `session.commit`. Jika guard gagal, jangan reconcile; biarkan writer aktif atau cron menyelesaikan. Tambahkan takeover action pada mock yang mengganti token lock tepat sebelum commit script.

### R14-05 · P3 — Test harness masih dapat memberi false confidence

Empat gap:

1. Test receipt menerima status pertama 200 **atau** 500 (`tests/e2e/auth-operations.spec.ts:580`), padahal injection `ZREVRANGE sessions` seharusnya membuktikan 500. Assertion longgar dapat lulus ketika fault tidak pernah terjadi.
2. `/__reset` membersihkan values, expiry, sorted set, dan email, tetapi tidak membersihkan array `failures` (`tests/helpers/mock-redis.mjs:166–172`). Rule yang tidak terkonsumsi dapat bocor ke test berikutnya.
3. Membership 409 dan createUser rollback sudah diperbaiki di code, tetapi kenaikan E2E hanya mencakup saga dan receipt. Tidak ada regression test khusus untuk dua P3 tersebut.
4. Mock belum punya `TTL`/`PTTL` atau assertion metadata untuk membuktikan claim verifikasi benar-benar permanen.

**Perbaikan.** Setiap fault test harus mengassert bahwa fault terpanggil dan response awal tepat. Reset mock wajib membersihkan failure rules. Tambahkan test khusus untuk membership lock, rollback takeover, receipt replay session count, purpose/payload mismatch, dan TTL index.

### R14-06 · P3 — Membership masih memetakan dependency error menjadi 404

`MutationConflictError` sekarang benar menjadi 409. Namun catch sisanya tetap selalu 404 (`app/api/admin/users/route.ts:27–30`). Error Redis atau failure revision di dalam mutation dapat tampil sebagai “Creator tidak ditemukan.”

**Perbaikan.** Petakan hanya `USER_NOT_FOUND` ke 404. Error datastore tetap 500/503. Ini tidak mengubah keputusan board sendiri, tetapi menjaga kontrak operator jujur.

## Penilaian klaim remediasi

| Klaim | Penilaian audit |
|---|---|
| `deleteIfEquals` strict; best-effort hanya lease | **Terkonfirmasi.** |
| Phone intent bertahan saat release dan inline repair gagal | **Terkonfirmasi dengan E2E phase-targeted.** |
| PATCH gagal menjadi 500 dan cron memulihkan | **Terkonfirmasi.** |
| Receipt ditulis atomik bersama commit | **Terkonfirmasi.** |
| Receipt membuat retry aman/idempoten | **Tidak diterima.** State commit dapat ditemukan, tetapi purpose, payload, session side effect, critical index, dan stale JSON belum aman. |
| Injection dapat menarget old-phone release | **Terkonfirmasi.** |
| Injection membuktikan lease takeover | **Belum.** Tes lama masih mensimulasikan EVAL failure. |
| Membership conflict 409 | **Terkonfirmasi di code; belum ada regression E2E khusus.** |
| Rollback email compare-and-delete | **Terkonfirmasi di code; belum ada takeover test khusus.** |
| Gate 5/5, 86 E2E, 15 unit, 0 vulnerability | **Terkonfirmasi independen.** |

## Scoring

Model bobot sama dengan putaran 9–13.

| Area | Bobot | Skor | Kontribusi | Yang menentukan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 8,4 | 1,34 | Admin dan atomic commit kuat; consumed OTP dapat mencetak session baru selama 30 menit. |
| Functional correctness | 14% | 8,3 | 1,16 | Phone failure path benar; receipt memberi 200 untuk purpose/password yang tidak committed. |
| QA depth | 12% | 9,5 | 1,14 | 5×86 stabil dan phone fault presisi; receipt, takeover, membership, rollback, serta TTL assertions belum lengkap. |
| Reliability | 10% | 8,1 | 0,81 | Phone recovery kuat; receipt gagal pada stale JSON dan verify index failure. |
| Data integrity | 10% | 8,2 | 0,82 | Orphan phone utama tertutup; user verified masih dapat kehilangan lookup email. |
| UX | 10% | 8,5 | 0,85 | False success reset dan replay 200 tanpa payload commit membingungkan pengguna. |
| Performance | 8% | 8,9 | 0,71 | TTFB live tetap di bawah 0,4 detik; belum ada budget/p95 historis. |
| Accessibility | 6% | 8,8 | 0,53 | Axe dua engine; belum ada screen-reader/manual pass. |
| SEO | 5% | 8,6 | 0,43 | Canonical Vercel hidup; custom domain belum resolve. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix ada; visual regression belum tersedia. |
| Trust & proof | 4% | 6,6 | 0,26 | Governance membaik; settlement dan bukti bisnis belum ada. |
| **Total** | **100%** |  | **8,46 → 8,5/10** |  |

## Improvement plan ringkas

### Gelombang A14 — blocker promosi · ±1–1½ hari

1. Redesign receipt menjadi purpose-bound, mutation-bound acknowledgment.
2. Jangan membuat session pada receipt replay; UI mengarahkan ke login bila response awal hilang.
3. Hapus JSON challenge dan buat verification indexes durable di script commit.
4. Hasil `challenge_spent` wajib fallback ke receipt yang tervalidasi.
5. Guard inline phone reconciliation; holder stale tidak boleh cleanup.
6. Perketat fault injection, isolation, dan acceptance matrix.

Spesifikasi implementasi lengkap ada di `BUILDER-HANDOFF-PUTARAN-14.md`.

### Setelah promosi

7. Auth smoke WebKit.
8. Visual regression enam permukaan utama.
9. Performance budget dan synthetic production flow.
10. Aktifkan Resend dan custom-domain DNS; kedua host wajib smoke 9/9.
11. `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif.

### Sebelum paid acquisition

12. Satu closed-beta campaign selesai sampai settlement dengan bukti yang dapat diaudit.
13. Tutup gap campaign, logo, masa berlaku, dan intake sample yang sudah tercatat.

Trigger indeks pencarian admin tetap: **10.000 record atau p95 endpoint admin >500 ms**, mana lebih dulu.

## Cara verifikasi

- `npm run qa` lima kali berturut-turut: 86 E2E dan 15 unit per run, 0 vulnerability.
- Probe lokal pada build production: session replay, cross-purpose receipt, different-password replay, verification-index expiry, dan stale challenge JSON.
- Smoke production pada Vercel dan custom domain.
- Review seluruh script EVAL, receipt reader, post-commit caller, session creation, phone reconciliation, mock failure rules, dan runbook.
- Audit tidak mengubah source produk. Hanya dokumen review, improvement plan, dan builder handoff yang diperbarui.
