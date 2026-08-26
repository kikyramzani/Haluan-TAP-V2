# TAP by Haluan — QC/QA Depth Review, Putaran 13

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,7/10**

Review independen atas lima item gate promosi putaran 12. Saya menelusuri script Lua dan seluruh caller, menjalankan `npm run qa` lima kali, menguji conflict dan failure path dengan mock serta proxy fault injection, lalu memeriksa dua host production.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Closed beta pada deployment Vercel sekarang | **GO WITH STRICT CONDITIONS** | Baseline live sehat dan belum memuat working tree ini. |
| Promosi working tree | **HOLD** | Compare-and-delete benar saat Redis menjawab, tetapi error transport ditelan. Probe menghasilkan dua claim nomor permanen, respons 200, intent hilang, dan cron tidak punya bahan recovery. |
| Peluncuran custom domain | **NO-GO saat audit** | `tap.haluandigital.agency` tetap tidak resolve; smoke 0/9. |
| Paid acquisition | **NO-GO** | Provider email, custom domain, synthetic flow, dan bukti settlement belum memenuhi gate. |
| Pengecualian admin legacy | **Tetap disetujui dan time-boxed** | Owner, pemicu, SLA 24 jam, bukti, tindakan bila terlambat, dan hard gate sudah tertulis. |
| Batas lock non-OTP | **Diterima sebagai utang arsitektur** | Micro-window setelah renewal boleh tetap terbuka untuk saat ini. Pengecualian ini tidak mencakup penghapusan intent setelah release yang gagal atau cleanup oleh holder yang kehilangan lease. |

## Ringkasan board

Peningkatannya nyata:

- Mock sekarang menghormati `PX`; expiry, renewal, takeover, dan wrong-token release benar-benar diuji.
- Lua compare-and-delete menghilangkan race `GET` lalu `DEL` pada caller yang sudah memakainya.
- Commit OTP sekarang memeriksa lock dan challenge, lalu mengonsumsi challenge serta menulis user dalam satu operasi.
- `sessionsInvalidBefore` menutup gap keamanan reset dan pencabutan admin sebelum physical session cleanup selesai.
- Sample updater dan reconciler melewati `session.commit`.

Namun klaim “kelima item sebelum promosi selesai” belum lolos. Masalah utamanya bukan algoritme Lua, melainkan perlakuan terhadap hasilnya. `deleteIfEquals` mengubah semua error Redis menjadi `false`, sementara caller saga tidak memeriksa nilai itu. Akibatnya, pelepasan claim lama yang gagal dianggap selesai dan intent ikut dihapus. Saya mereproduksi keadaan persis ini; cron kemudian melaporkan nol perbaikan karena jurnalnya sudah tidak ada.

Boundary setelah commit OTP juga belum idempoten. Jika user record dan challenge sudah committed lalu sweep session gagal, endpoint menjawab 500, retry kode menjawab 400, padahal kata sandi baru sudah aktif. Untuk verifikasi email risikonya lebih besar: email dan phone index dibuat permanen setelah script commit. Kegagalan pada tahap itu dapat meninggalkan user berstatus verified dengan claim sementara yang masih akan kedaluwarsa.

Skor naik dari 8,6 ke 8,7 karena primitive inti dan kedalaman QA membaik. Working tree tetap HOLD karena satu failure path masih menghasilkan divergence permanen sambil memberi respons sukses.

## Bukti yang saya jalankan sendiri

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | **5/5 exit 0** |
| E2E | **84/84 per run**, 420 eksekusi total |
| Unit test | **15/15 per run**, 75 eksekusi total |
| Dependency audit | **0 vulnerability** pada kelima run |
| Build, TypeScript, lint | lulus pada kelima run |
| `git diff --check` | lulus sebelum laporan ini ditulis |
| Skenario unik | 16 auth + 10 public + 7 accessibility + 1 legacy = **34** |
| Sebaran | 33 mobile Chromium · 33 desktop Chromium · 17 mobile WebKit · 1 legacy-auth |

Kenaikan 80 → 84 berasal dari dua skenario baru yang masing-masing berjalan pada dua profil Chromium. Ini cakupan baru yang sah. Satu tes takeover belum menginjeksi takeover yang disebut pada namanya; detailnya ada di R13-03.

### Probe adversarial

**Release claim nomor gagal setelah record berpindah — gagal aman**

Saya menjalankan aplikasi melalui proxy Redis yang hanya menggagalkan script `delete_if_equals` pada key phone lama. Hasilnya:

```text
PATCH profile: 200
record phone: nomor baru
claim nomor lama: user yang sama
claim nomor baru: user yang sama
phone-intent: null
phone-intents: 0
cron: phoneClaimsRepaired 0
claim lama setelah cron: masih ada
```

Ini divergence permanen. Nomor lama tidak dapat dipakai akun lain, request sudah diberi 200, dan cron tidak dapat mengetahui pasangan `from`/`to` karena intent sudah dihapus.

**Reset committed, session sweep gagal — hasil ambigu**

Saya menyuntik kegagalan `ZREVRANGE` setelah script OTP menulis password dan mematikan session secara logis:

```text
reset pertama: 500
retry kode yang sama: 400
login dengan password baru: 200
```

Keamanan akun tetap benar berkat `sessionsInvalidBefore`, tetapi respons dan retry contract salah. Operasi berhasil di datastore namun dilaporkan gagal, lalu receipt satu kali sudah hilang.

**Membership lock conflict — mapping salah**

```text
lock user ditahan eksternal
PATCH membership: 404 "Creator tidak ditemukan."
```

Record ada. Ini seharusnya 409 retryable sesuai tabel runbook, bukan 404.

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke `haluan-tap.vercel.app` | **9/9** |
| Health | `ready` |
| Region | `sin1::sin1` |
| TTFB homepage, 3× | 0,154–0,186 detik |
| Katalog | 310 TikTok · 383 Shopee |
| CSP dan canonical | hadir; canonical memakai host Vercel |
| Smoke `tap.haluandigital.agency` | **0/9**, DNS tidak resolve |

Production belum memuat working tree, jadi hasil 9/9 membuktikan baseline live—bukan koreksi putaran 13.

## Temuan

### R13-01 · P2 — Saga menghapus intent setelah ownership release gagal

`lib/atomic.ts:12–15` menangkap semua error `EVAL` dan mengembalikan `false`. Nilai `false` dapat berarti dua hal yang sangat berbeda:

1. key tidak lagi dimiliki caller—hasil aman; atau
2. Redis tidak pernah menyelesaikan compare-and-delete—hasil tidak diketahui.

Caller tidak dapat membedakannya. Pada `lib/auth.ts:466–470`, record baru ditulis, `releasePhoneClaim` dipanggil, lalu intent dan queue selalu dihapus. Karena `releasePhoneClaim` juga tidak memeriksa boolean, kegagalan transport pada EVAL tidak membatalkan cleanup. Reconciler punya pola yang sama pada `lib/auth.ts:404–414`: kegagalan delete ditelan, lalu intent dihapus.

Catch di `lib/auth.ts:473–476` menambah risiko lain. Ia menjalankan reconciler langsung tanpa memastikan session masih memegang lock. Jika lease sudah berpindah, holder lama dapat membaca atau menghapus intent milik writer penerus.

**Perbaikan.** Pisahkan primitive ketat dan best-effort. Primitive ketat harus mengembalikan `false` hanya untuk compare mismatch dan melempar error transport. Phone saga serta reconciler wajib memakai versi ketat; intent hanya boleh dihapus setelah semua langkah yang menentukan konsistensi terkonfirmasi. Pada `MutationConflictError`, jangan reconcile dari holder lama—tinggalkan intent untuk writer aktif atau cron.

**Selesai bila.** Kegagalan release setelah record write membuat request non-200, intent tetap ada, cron memperbaiki menjadi tepat satu claim, lalu intent kosong. Kegagalan reconciler mempertahankan intent untuk sweep berikutnya.

### R13-02 · P2 — OTP core atomik, tetapi hasil setelah commit belum idempoten

`commitWithChallenge` benar-benar membuat lock check, challenge spend, dan user write satu keputusan. P11-03 dapat dianggap tertutup pada boundary itu.

Masalah berikutnya ada setelah script mengembalikan `committed`:

- Reset menjalankan cleanup challenge, pointer, seluruh session key, dan revision dalam `Promise.all` (`lib/auth.ts:179–184`). Kegagalan session sweep membuat route 500 setelah password sudah berubah dan challenge sudah habis.
- Verifikasi email menjalankan persistensi email/phone index, pending-index cleanup, dan revision setelah commit (`lib/auth.ts:144–151`). Claim registrasi awal hanya hidup 30 menit. Jika persistensi index gagal, record sudah verified dan kode sudah habis, tetapi lookup email atau phone dapat hilang ketika TTL claim awal kedaluwarsa.

`sessionsInvalidBefore` membuat physical deletion housekeeping yang aman dijalankan best-effort. Email dan phone index verifikasi bukan housekeeping; keduanya bagian dari commit bisnis.

**Perbaikan.** Tulis receipt idempoten per challenge di script. Retry challenge yang sudah committed harus mengembalikan hasil committed, bukan 400. Untuk verifikasi, ikutkan persistensi ownership index dan penghapusan pending marker dalam script, atau tulis verification intent yang direkonsiliasi sampai durable. Setelah commit, cleanup nonkritis harus dicatat dan di-retry tanpa mengubah respons sukses menjadi 500.

**Selesai bila.** Failure injection pada setiap langkah setelah commit menghasilkan salah satu dari dua hasil konsisten: response sukses/receipt committed, atau operasi belum committed dan kode tetap dapat dipakai. User verified tidak boleh bergantung pada claim yang masih punya TTL registrasi.

### R13-03 · P3 — Failure injection belum menarget fase yang diklaim tes

Mock hanya dapat gagal berdasarkan nama command. Pada tes saga (`tests/e2e/auth-operations.spec.ts:537–540`), rule `EVAL times: 1` mengenai EVAL renewal yang dipanggil `session.commit` sebelum write—bukan EVAL pelepasan claim lama di dalam write. Karena itu tes lulus tanpa pernah membuktikan recovery setelah old-claim release gagal.

Tes “lease yang berpindah setelah kode dibaca” (`tests/e2e/auth-operations.spec.ts:493–497`) juga menggagalkan EVAL commit sebagai error transport. Ia tidak mengganti token lock dan tidak membuat script mengembalikan `lock_lost`. Tes ini membuktikan kode bertahan saat script tidak berjalan, bukan saat lease diambil penerus.

**Perbaikan.** Failure injector perlu selector `scriptTag`, `keyPrefix`, dan `failOnNth`, plus aksi takeover yang mengganti lock token sebelum script commit dijalankan. Nama dan assertion tes harus sama dengan fault yang benar-benar diinjeksi.

### R13-04 · P3 — Kontrak conflict masih salah pada membership

`app/api/admin/users/route.ts:25–26` menangkap seluruh error dan mengembalikan 404. `MutationConflictError` dari `updateMembership` ikut berubah menjadi “Creator tidak ditemukan.” Ini bertentangan dengan tabel runbook yang menyatakan mutasi interaktif menerima 409 aman diulang.

**Perbaikan.** Petakan `MutationConflictError` ke 409, `USER_NOT_FOUND` ke 404, dan error dependency ke 500/503. Tambahkan E2E dengan lock user yang benar-benar ditahan.

### R13-05 · P3 — Klaim “seluruh ownership key” masih punya satu pengecualian

Rollback email pada collision phone di `createUser` masih memakai `DEL` langsung (`lib/auth.ts:51–54`), bukan compare-and-delete. Untuk registrasi pending key itu punya TTL 30 menit, jadi takeover memerlukan stall yang ekstrem; risikonya rendah. Namun klaim dokumentasi bahwa tidak ada ownership rollback yang memakai raw `DEL` belum benar.

**Perbaikan.** Gunakan compare-and-delete dengan expected user ID pada rollback ini dan tambahkan takeover test spesifik.

## Penilaian lima item promosi

| Item | Penilaian audit |
|---|---|
| Compare-and-delete atomik di ownership key | **Sebagian besar benar.** Compare/delete atomik, tetapi error disamarkan sebagai mismatch; phone saga lalu menghapus intent. Satu raw rollback juga tersisa. |
| Commit OTP atomik | **Core tertutup.** Lock + challenge + user write atomik. Post-commit receipt, cleanup, dan verification index belum idempoten/durable. |
| Mock `PX` dan lifecycle lease | **Terkonfirmasi.** Unit test langsung lulus dan expiry nyata. |
| Guard by construction | **Terkonfirmasi untuk writer yang disebut.** Sample dan reconciler memakai `session.commit`; stale-holder catch pada profile masih dapat menjalankan cleanup di luar valid lease. |
| Kontrak konflik per caller | **Belum tertutup.** Membership conflict masih 404. |
| Gate 5/5, 84 E2E, 15 unit, 0 vulnerability | **Terkonfirmasi independen.** |

## Skor

Model bobot sama dengan putaran 9–12.

| Area | Bobot | Skor | Kontribusi | Yang menentukan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 9,3 | 1,49 | OTP commit dan logical session invalidation kuat; legacy admin tetap pengecualian terkontrol. |
| Functional correctness | 14% | 8,8 | 1,23 | Happy path kuat; reset dapat berhasil sambil menjawab 500. |
| QA depth | 12% | 9,4 | 1,13 | 5×84 stabil, PX nyata, failure injection bertambah; dua fault belum menarget fase pada namanya. |
| Reliability | 10% | 8,1 | 0,81 | Heartbeat dan retry ada; post-commit outcome serta saga release failure belum aman. |
| Data integrity | 10% | 8,0 | 0,80 | Lost update tertahan, tetapi probe menghasilkan orphan claim permanen dengan respons 200. |
| UX | 10% | 8,9 | 0,89 | Flow dan copy kuat; false 500/400 pada reset serta false 404 membership tersisa. |
| Performance | 8% | 8,9 | 0,71 | TTFB live 0,154–0,186 detik; belum ada budget atau p95 historis. |
| Accessibility | 6% | 8,8 | 0,53 | Axe dua engine; belum ada screen-reader/manual pass. |
| SEO | 5% | 8,6 | 0,43 | Canonical Vercel hidup; custom domain belum resolve. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix ada; visual regression belum tersedia. |
| Trust & proof | 4% | 6,6 | 0,26 | Governance membaik; settlement dan bukti bisnis belum ada. |
| **Total** | **100%** |  | **8,68 → 8,7/10** |  |

## Improvement plan

### Gelombang A13 — sebelum promosi · ±½–1 hari

1. Jadikan compare-and-delete strict secara default; error datastore harus melempar, mismatch ownership boleh mengembalikan `false`. Best-effort hanya eksplisit untuk lock release dan key sementara.
2. Jangan hapus phone intent sampai old-claim release, record truth, dan final claim terkonfirmasi. Holder yang kehilangan lease tidak boleh menjalankan reconciler langsung.
3. Tambahkan receipt OTP idempoten. Untuk verify, masukkan durability email/phone index ke commit atau verification saga; untuk reset/revoke, physical session cleanup menjadi retryable housekeeping dengan telemetry.
4. Buat fault injection presisi: `scriptTag`, `keyPrefix`, `failOnNth`, dan takeover action. Uji semua fase setelah record write serta setelah OTP commit.
5. Map membership conflict ke 409 dan ganti raw email rollback di `createUser` dengan compare-and-delete.

### Gate promosi

6. Failure tepat pada pelepasan claim lama: request tidak boleh 200, intent tetap ada, cron menyisakan tepat satu claim dan membersihkan intent.
7. Failure pada reconciler: intent tidak hilang dan sweep berikutnya menyelesaikan recovery.
8. Failure setelah OTP commit: retry challenge mengembalikan receipt committed atau response pertama tetap sukses; tidak ada 500 → 400 untuk operasi yang sebenarnya berhasil.
9. Verify commit tidak pernah meninggalkan lookup email/phone dengan TTL sementara.
10. Held-lock membership menghasilkan 409; takeover rollback tidak menghapus owner baru.
11. `npm run qa` lima kali, 0 vulnerability, dan `git diff --check` setelah perubahan terakhir.

### Gelombang B — setelah promosi

12. Auth smoke WebKit, bukan hanya public/accessibility.
13. Visual regression enam permukaan utama.
14. Performance budget dan synthetic production flow.
15. Aktifkan Resend dan custom-domain DNS; kedua host wajib smoke 9/9.
16. `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif.

### Sebelum paid acquisition

17. Satu closed-beta campaign selesai sampai settlement dengan bukti yang dapat diaudit.
18. Tutup gap campaign, logo, masa berlaku, dan intake sample yang sudah tercatat.

Trigger indeks pencarian admin tetap: **10.000 record atau p95 endpoint admin >500 ms**, mana lebih dulu.

## Cara verifikasi dijalankan

- `npm run qa` lima kali berturut-turut: exit 0 semua, 84 E2E dan 15 unit per run.
- Probe lokal pada build production: held-lock OTP, held-lock membership, post-commit reset failure, dan phone-release failure terarah melalui proxy Redis.
- `npm run smoke:production` dijalankan pada host Vercel dan custom domain.
- Seluruh callback `withRecordLock`, script EVAL, ownership release, OTP cleanup, route mapping, cron, dan dokumentasi ditelusuri langsung.
- Tidak ada source code produk yang diubah oleh audit; hanya laporan dan improvement plan diperbarui.
