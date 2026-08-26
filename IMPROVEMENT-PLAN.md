# TAP by Haluan — Improvement Plan

**Basis:** audit putaran 14, commit dasar `215a1bf` terhadap production `https://haluan-tap.vercel.app` · skor **8,5/10**
**Sisa engineering sebelum promosi:** ±1–1½ hari · sisanya menunggu input eksternal, ops, dan bukti bisnis
**Tujuan:** mempertahankan one-time semantics OTP, membuat verify index durable, dan memisahkan acknowledgment receipt dari autentikasi

## Keputusan board · putaran 14

Gate independen lulus 5/5 dengan 86 E2E per run, 15 unit test, dan nol vulnerability. Strict compare-and-delete, phone intent retention, phase-targeted phone injection, membership 409, dan ownership-safe registration rollback diterima.

Promosi tetap **HOLD** karena satu P1 dan dua P2:

1. **R14-01 · P1 — receipt dapat mencetak session baru.** Receipt yang sama dipakai tiga kali dan session naik 1 → 4. Receipt juga tidak terikat purpose atau payload: verify receipt diterima reset, dan replay password berbeda tetap 200 walau tidak committed.
2. **R14-02 · P2 — verify index belum durable.** User dan receipt committed sebelum email/phone index dibuat permanen. Replay receipt tidak mengulang finalisasi; setelah TTL claim awal habis, user verified tidak dapat ditemukan lewat email.
3. **R14-03 · P2 — stale challenge JSON menyembunyikan receipt.** Bila penghapusan JSON challenge gagal, retry masuk jalur `challenge_spent` dan mendapat 400 walau receipt serta mutasi sudah committed.

Tiga P3: takeover test masih hanya menggagalkan EVAL, inline phone reconciliation belum dijaga ulang, test harness belum mengassert fault/isolation secara ketat, dan membership dependency error masih dapat terlihat sebagai 404.

Detail evidence ada di `AUDIT-PUTARAN-14.md`. Instruksi implementasi lengkap ada di `BUILDER-HANDOFF-PUTARAN-14.md`.

## Gelombang A14 — blocker promosi · ±1–1½ hari

1. **Receipt purpose/payload-bound.** Simpan schema version, purpose, user ID, code hash, committed timestamp, dan mutation fingerprint. Reset replay harus memverifikasi password request terhadap state yang committed.
2. **Receipt bukan session credential.** Return type membedakan `committed` dan `replayed`; route hanya membuat session untuk commit baru. Replay mengarahkan user ke login.
3. **Verify commit durable.** User, receipt, challenge JSON/guard, email/phone claim permanen, dan pending-index cleanup berada dalam satu EVAL atau satu saga durable yang setara.
4. **Challenge-spent fallback.** Outcome `challenge_spent` tetap membaca receipt tervalidasi; stale JSON tidak boleh menghasilkan false 400.
5. **Guard inline reconciliation.** Profile start/catch menjalankan reconciler melalui `session.commit`; holder stale meninggalkan intent.
6. **QA harness ketat.** Failure rules dibersihkan oleh reset, fault hit harus terbukti, deterministic status tidak boleh memakai assertion longgar, dan mock dapat memeriksa TTL.
7. **Caller mapping.** Membership hanya memberi 404 untuk `USER_NOT_FOUND`; datastore failure menjadi 500/503.

## Gate promosi

8. Receipt replay tidak menambah session.
9. Cross-purpose receipt dan different-password replay ditolak tanpa session baru.
10. Verify selalu menghasilkan email/phone claim permanent; index conflict tidak menghabiskan code.
11. Challenge JSON dan guard hilang dalam commit yang sama; retry response-loss tetap konsisten.
12. Real lock takeover menghasilkan `lock_lost` dan code tetap hidup.
13. Phone stale-holder tidak menyentuh intent penerus.
14. Membership conflict/not-found/dependency masing-masing 409/404/500–503.
15. Seluruh matrix `BUILDER-HANDOFF-PUTARAN-14.md` lulus.
16. Jalankan `npm run gate` pada commit final; simpan log dan sidecar SHA-256 yang dihasilkannya.

## Gelombang B — QA dan aktivasi

17. Tambahkan auth smoke WebKit.
18. Tambahkan visual regression enam permukaan utama.
19. Tetapkan performance budget dan synthetic production flow.
20. Aktifkan Resend dan DNS custom domain; kedua host wajib smoke 9/9.
21. Pastikan `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif.

## Tambahan dari audit putaran 15 (independen)

Keenam temuan putaran 14 saya benarkan dan P1-nya saya reproduksi sendiri (session 1 → 4). Handoff putaran 14 sudah memuat work package A–G dan matriks 32 skenario; dua item berikut belum tercakup di sana.

- **T15-01 · P2 · strictness putaran 13 menciptakan jalur 500 setelah commit.** `releaseEmailSend` memakai `deleteIfEquals` yang sekarang melempar, dan ia dipanggil di blok pembersihan **setelah** commit OTP. Satu error transient di sana mengubah verifikasi yang sudah berhasil menjadi 500, lalu retry-nya jatuh ke jalur false-400 di R14-03. Kondisi yang menjadi alasan receipt dibuat justru lebih mudah terjadi setelah perubahan itu. Perbaikan: pembersihan post-commit memakai varian best-effort secara eksplisit; yang strict tetap di saga dan `deletePendingUser`.
- **T15-02 · P3 · replay tidak mengembalikan hasil asli.** Jalur replay `verifyEmailWithChallenge` melewati `reconcileAdminRole`, padahal commit pertama menjalankannya. Selesaikan bersama R14-01 dengan menyatakan kontrak replay sebagai acknowledgment commit, bukan pengulangan hasil.

**Urutan penyalaan yang harus dijaga.** Perbaikan receipt lebih dulu, Resend sesudahnya. Cacat P1 tidak ada di production karena yang tayang adalah `215a1bf` dan `verify/request` di sana menjawab 503 — jalur OTP tidak dapat dicapai. Itu satu-satunya alasan ini belum menjadi insiden; menyalakan Resend sebelum perbaikan membalik urutannya.

**Tiga gate yang tidak bisa ditawar,** dengan gate ketiga diperketat oleh reviewer: replay kode yang sudah dipakai tidak menambah session (dibuktikan dengan menghitung anggota `user:{id}:sessions`), receipt verify ditolak di endpoint reset dan sebaliknya, dan kegagalan housekeeping **tidak boleh mengubah commit sukses menjadi 500 sejak awal** — bukan sekadar "retry akhirnya sukses".

**Koreksi reviewer yang saya terima.** 30 session bukan plafon absolut per receipt. Rate limit memakai fixed hourly bucket (`Math.floor(now / 3_600_000)`), sehingga receipt 30 menit dapat melintasi pergantian bucket: pada timing terburuk sekitar **60 request per challenge dan 20 per IP** selama receipt hidup. Nuansa T15-02 juga saya terima — replay setelah request pertama selesai normal tidak bermasalah; cacatnya muncul ketika commit mendarat lalu cleanup melempar **sebelum** `reconcileAdminRole`, dan replay early-return sehingga rekonsiliasi tidak pernah dijalankan.

## Status implementasi · remediasi putaran 17 · 17 Agustus 2026

Gelombang A17, enam item. Working tree tetap **HOLD** dan Resend tetap **hard-blocked**.

**R17-01 · P2 · selesai.** Race-nya dihilangkan secara struktural, bukan ditambal.

- **Satu source of truth TTL** di `lib/email-auth.ts`: `CHALLENGE_TTL_SECONDS` (30 menit), `CLAIM_MARGIN_SECONDS` (30 menit), `PENDING_CLAIM_TTL_SECONDS` = 60 menit. `createUser` memakai konstanta itu, bukan angka sendiri.
- **Klaim diperbarui setiap kode baru diterbitkan,** ownership-safe: `SET NX` bila kosong, compare-and-pexpire bila masih milik user yang sama, dan tidak menyentuh apa pun bila milik akun lain. Jadi kode tidak pernah bisa hidup lebih lama daripada klaim yang ia butuhkan.
- **Recovery lewat pending index.** Ketika email index sudah tidak menunjuk ke mana pun, `verify/request` mencari akun pending lewat `users:pending` (dibatasi 500 anggota terbaru; pemotongan dicatat sebagai `pending.scan_truncated`, bukan didiamkan), lalu mengambil kembali alamatnya dengan `SET NX` sebelum mengirim kode. Ini menutup dead end yang Anda temukan: akun lama pulih tanpa rebind manual dan tanpa registrasi ulang.
- **Alamat milik akun lain → tidak ada kode yang dikirim.** Respons tetap anti-enumeration 200, dan konfliknya dicatat untuk support alih-alih dibiarkan ditemukan sendiri oleh penggunanya.

**R17-02 · P2 QA · selesai.** `tests/atomic-contract.test.mjs` menjalankan **Lua production terhadap `redis-server` asli**, dan melewati transport `redis()` yang sama dengan aplikasi lewat jembatan REST→RESP kecil. Jadi bukan hanya isi script yang diuji, tapi juga konstruksi KEYS/ARGV dan pemetaan outcome. Delapan test menutup ketujuh keadaan yang Anda minta: lock lost, challenge spent, email conflict, phone conflict, tidak ada write apa pun saat conflict, klaim menjadi permanen saat commit (`TTL -1`), klaim milik sendiri hanya diperpanjang, compare-and-delete, dan lease renewal.

**Mutation check yang membuktikan gap-nya nyata dan tertutup:** loop ownership dihapus **hanya dari Lua** (mock dibiarkan utuh) — E2E tetap hijau, dan contract test menjadi merah di dua test (`email conflict`, `phone conflict`). Itu persis skenario yang Anda sebut lolos tanpa terdeteksi.

`redis-server` menjadi dependency test lokal (`brew install redis`); test gagal dengan pesan yang menyebutkan itu, bukan lewat begitu saja.

Satu jebakan yang tertangkap saat menjalankan gate, bukan saat menulis test: `tests/tap-security.test.mjs` sudah memakai port 6399, dan `node --test` menjalankan file secara paralel. Berdiri sendiri contract test lulus 8/8, tetapi di dalam `npm test` `redis-cli` berbicara dengan server HTTP dan melaporkan protocol error yang tidak menyebut satu pun nama test. Port dipindahkan ke 6479/6478 (dapat di-override lewat env untuk CI) dan pesan kegagalan sekarang menyebut portnya. Inilah alasan gate dijalankan setelah perubahan terakhir, bukan sebelum.

**R17-03 · P3 · selesai.**

1. Tabel OTP kini menyatakan tiga status itu adalah outcome terminal **setelah** precondition ownership lulus.
2. "Within the hour" diganti jadwal sebenarnya: cron harian `02:17 UTC` atas akun pending berumur ≥1 jam, jadi tunggunya bisa mendekati 25 jam — dengan instruksi eksplisit untuk tidak menunggu cron bila ada orang yang terblokir.
3. Runbook menyatakan kode hanya berlaku sampai expiry aslinya, dan menjelaskan `challenge.claim_conflict` (`before.stage` = `code_request` atau `commit`, `after.heldBy` hanya di trail admin).

**Mutation check tambahan** (semua dipulihkan setelah pengujian):

- Recovery lookup dilepas → test contested-recovery merah.
- Renewal klaim dilepas → test invariant TTL merah pada assertion setelah klaim dipendekkan.
- Margin TTL tidak perlu dimutasi terpisah: assertion-nya membandingkan TTL nyata dari store (3600 versus 1800), jadi margin nol gagal secara aritmetika.

**Acceptance test baru:** `klaim pendaftaran selalu hidup lebih lama daripada kode terbarunya` (termasuk pengganti accelerated-clock: klaim dipendekkan ke 120 detik, lalu kode baru diminta dan klaim harus kembali melampauinya), `akun yang emailnya sempat direbut tetap dapat pulih setelah kodenya kedaluwarsa`, dan `claim conflict tercatat untuk support tanpa membocorkan pemiliknya`.

**Gate setelah perubahan terakhir.** `npm run qa` lulus **lima kali berurutan**: lint bersih, **24 unit/contract**, **0 vulnerability**, build sukses, **110 E2E** per run (1,7–1,9 menit). `git diff --check` bersih. Gate ini dijalankan ulang setelah batch logo terakhir, bukan sebelum.

**Batch logo 17–18 Agustus 2026.** 57 file WebP baru untuk 66 nama katalog plus 8 alias; dua aset ditolak setelah diperiksa (`the-pods` logo perusahaan lain, `aerostreet` kolase foto produk). Coverage logo katalog **54% → 64%** (397 dari 619 brand unik). Sembilan file terakhir berasal dari file zip yang tidak tercatat di manifest dan diperiksa satu per satu. Detail dan provenance ada di `BRAND-LOGO-SOURCES.md`; sisa gap ada di `BRAND-LOGO-GAPS.md`.

## Pre-RC putaran 19 · binding admin dan disiplin gate · 18 Agustus 2026

**P1 binding admin↔index · ditutup di runtime dan di auditor.** Temuan Anda benar dan celahnya persis di `reconcileAdminRole`: entitlement dinilai dari allowlist saja, lalu early-return membuat tidak ada yang memeriksa lagi. Dua record bisa sama-sama membawa alamat allowlist, index menunjuk B, dan A tetap admin.

- Runtime: entitlement sekarang **allowlist DAN memegang index email** (`email:{address}` menunjuk user itu). Kalau tidak, akses dicabut tanpa syarat dan seluruh session dihapus, dengan `admin.revoked` mencatat alasannya (`email_index_mismatch` atau `allowlist_removed`). Jalur grant membaca ulang index **di dalam lock**, supaya tidak memberi akses atas pembacaan basi.
- Auditor: logikanya dipindah ke `lib/admin-audit.ts` sebagai fungsi murni. Verdict `AMAN` menuntut delapan dimensi nol: `unprovenAdmins`, `openSlots`, `brokenClaims`, `orphanAdmins`, `adminIndexMismatches`, `duplicateRecords`, `impermanentClaims` (TTL klaim harus `-1`), dan `unindexed`.
- **Delapan unit test** untuk verdict auditor, termasuk skenario A/B Anda: index menunjuk B, admin ada di A, `openSlots=0` — dan verdict tetap **tidak aman** karena `adminIndexMismatches=1`. Tanpa itu, kasus ini persis yang lolos.
- E2E: admin kehilangan akses pada request berikutnya ketika index berpindah ke akun lain, `admin.revoked` memuat alasan tepat `email_index_mismatch`, lalu akses kembali setelah index dikembalikan. Jalur offboarding mengassert alasan terpisah `allowlist_removed`. Mutation check: syarat index dilepas → test merah di `expect(403)`.

**Exhaustive handling.** Kedua writer memakai `switch` dengan parameter bertipe `never`. Dibuktikan menggigit: menambahkan satu outcome ke `ChallengeCommitOutcome` membuat `tsc` gagal di **kedua** call site, bukan lolos diam-diam seperti yang melahirkan P0 reset.

**Server reuse dimatikan — dan ini bukan teori.** Saat menulis test binding admin, satu test gagal dengan snapshot halaman berjudul "HDA GO", proyek lain yang kebetulan memegang port 3101. Persis kelemahan yang Anda sebut: `reuseExistingServer` tidak bisa membedakan build yang diuji, build basi, dan aplikasi orang lain.

- `reuseExistingServer: false` pada ketiga webServer. Gate tidak akan pernah meminjam server yang tidak ia jalankan sendiri.
- Port dapat dipindah lewat `E2E_PORT` / `E2E_LEGACY_PORT`, dan spec membaca variabel yang sama supaya header `Origin` selalu cocok dengan server yang benar-benar diuji.
- `retries: 0` di semua lingkungan. Required gate yang hijau pada percobaan kedua menjawab "akhirnya lulus", bukan pertanyaan yang seharusnya ia jawab.

**Evidence ledger dirapikan.** `git diff --check 215a1bf..HEAD` sekarang bersih (sebelumnya 18 entri trailing-whitespace di dua dokumen audit); klaim byte-identical ditulis sebagai `toBe` atas raw string, bukan `toEqual`; angka backlog logo diperbarui ke 64% (TikTok 60%, Shopee 71%); dan kalimat runbook tentang token diperbaiki menjadi apa yang benar-benar dapat dibuktikan — script mewajibkan variabel read-only dan tidak membaca fallback read-write, tetapi tidak dapat menjamin scope token itu sendiri.

**Yang tetap tidak saya klaim:** ini masih bukti lokal. Gate GitHub Actions, main protection, dan preview probes tetap terbuka, dan containment `ADMIN_EMAILS` di production tetap tindakan Anda.

## Release candidate · 18 Agustus 2026

Branch **`security/auth-hardening-round-18`**, bercabang dari `215a1bf`, memiliki **draft PR #1** (`https://github.com/brianpb9/haluan-tap/pull/1`). Dokumen ini tidak mengasumsikan local HEAD selalu sudah di-push: kandidat diterima hanya ketika **PR head = `commit sebelum` artifact = `commit sesudah` artifact**. Snapshot 18 Agustus 2026 saat review mencatat `main` masih di `215a1bf`; verifikasi ulang sebelum promosi.

| SHA | Commit | Isi |
|---|---|---|
| `9274e08` | batch logo | 60 file: 57 aset WebP, tabel resolver, provenance, gap |
| `f38e216` | hardening auth | 57 file: model OTP, klaim, harness, audit tool, docs |
| `c72ec20` | catatan bukti RC | dokumen |
| `fddfae3` | binding admin ↔ index | runtime entitlement, modul verdict auditor, isolasi server E2E |
| `ff59547` | hardening auditor dan evidence | `brokenClaims`, re-read entitlement, port mock, runner gate berartefak |
| `f1eeea4` | perbaikan regresi gate | helper datastore E2E tidak lagi menaungi `storeUrl` |
| `HEAD pada artifact gate` | gate fail-closed | validasi argumen/metrik dan baseline cardinality, artifact + sidecar aman, output tahap lengkap, workflow mengunggah evidence |

Hardening runner setelah `f1eeea4` tidak mencoba menulis hash commit-nya sendiri ke dokumen di dalam commit tersebut. Exact SHA kandidat diambil dari artifact gate; setelah push, PR head wajib sama dengan SHA itu. Ini menghindari rantai commit dokumentasi tanpa akhir.

**Snapshot check eksternal · 18 Agustus 2026.** Dua check merah di PR bukan kegagalan kode: Quality Gate run `32064765101` gagal sebelum satu langkah pun berjalan (`The job was not started because an Actions budget is preventing further use`), dan preview Vercel gagal karena author commit tidak punya akses ke project. Keduanya tetap blocker rilis yang sah sampai rerun exact-SHA hijau. Author commit sengaja **tidak** ditulis ulang: itu mengubah SHA dan membatalkan bukti gate yang sudah terkumpul.

Logo dipisah lebih dulu dan **dibuktikan berdiri sendiri hijau** (sisa tree di-stash: lint bersih, unit 9/9, build sukses), bukan hanya dipisah di atas kertas. Assertion logo di `tests/tap-security.test.mjs` ikut commit auth karena file itu juga memuat perubahan port harness; memecah satu file lintas dua commit membuat salah satunya merah.

**Gate pada SHA yang immutable.** `npm run qa` lulus **lima kali berurutan** pada `f38e2169c5cd2e9fedb4c5ecaebe74bf94a5a5ca`: lint bersih, 24 unit/contract, 0 vulnerability, build sukses, **114 E2E** per run (1,5–1,6 menit). `git diff --check` bersih. SHA dicetak sebelum dan sesudah rangkaian gate dan **identik**, dan `git status` kosong sesudahnya — jadi tidak ada perubahan tree di tengah pengukuran.

Ini bukti engineering lokal, bukan CI independen. Gate GitHub Actions tetap merah sebagai release blocker sampai kapasitasnya pulih.

### Koreksi presisi test yang diminta board

- **Byte-identical.** Perbandingan record memakai **string mentah** dari Redis (`toBe`), bukan `JSON.parse(...).toEqual(...)`. Klaimnya sekarang sama dengan yang diuji.
- **Fixture rival.** Field rival konsisten dengan datum yang diperebutkan: pada konflik email, email rival adalah alamat itu; pada konflik nomor, nomornya adalah nomor itu. Index dan record sepakat siapa pemiliknya, jadi yang terbukti bukan sekadar "index menunjuk ke tempat lain".

### Audit admin fail-closed

`scripts/audit-admins.mjs` menolak berjalan tanpa `KV_REST_API_READ_ONLY_TOKEN` (exit 2, tanpa fallback read-write) dan membaca record lewat `SCAN` sehingga admin yang terlepas dari `tap:v1:users` tetap terhitung. `openSlots` hanya berarti index kosong dan alamat siap diklaim; index yang menunjuk record hilang atau record dengan email berbeda masuk `brokenClaims`, karena claim itu masih memblokir signup dan membutuhkan tindakan operator yang berbeda.

### Kontradiksi runbook diselesaikan

Tiga aturan admin dinyatakan asimetris sesuai implementasi: **grant** butuh allowlist, index yang menunjuk akun itu, dan bukti kepemilikan; **keep** butuh allowlist dan index tetapi tidak memaksa bukti untuk admin legacy; **remove** terjadi ketika allowlist atau index hilang. `unprovenAdmins=1` karena itu adalah pengecualian legacy yang terlihat, bukan kontradiksi. Biaya penutupan slot juga dicatat: `/api/health` menganggap `ADMIN_EMAILS` non-kosong sebagai dependency kritis, jadi mengosongkannya menghasilkan **503** — dan runbook menyatakan itu lebih baik daripada pintu admin terbuka.

## Status implementasi · P0 reset dan containment admin · 18 Agustus 2026

**Gate setelah perbaikan P0.** `npm run qa` lulus **lima kali berurutan**: lint bersih, **24 unit/contract**, **0 vulnerability**, build sukses, **114 E2E** per run (naik dari 110 karena dua acceptance test konflik reset × dua project). `git diff --check` bersih.

Catatan jujur tentang gate ini: gate yang sama juga hijau **sebelum** P0 ditemukan. Kekuatannya breadth, bukan oracle — dan dua test baru inilah oracle yang sebelumnya tidak ada untuk jalur reset.

**P0 · selesai. Ini regresi saya sendiri dari putaran 18.** Saya menambahkan `indexes` ke commit reset supaya reset ikut mempermanenkan klaim, tetapi tidak menambahkan cabang `index_conflict` di jalur reset. Akibatnya commit yang **ditolak script** jatuh ke jalur sukses: record tidak berubah, password lama tetap berlaku, `sessionsInvalidBefore` tidak tersimpan, tetapi API menjawab 200 dengan session baru.

Pelajaran yang saya catat: menambah outcome baru ke sebuah primitive berarti **setiap** pemanggilnya harus diperiksa, bukan hanya yang sedang saya kerjakan. Putaran 16 menambahkan `index_conflict`, putaran 18 menambahkan pemanggil kedua, dan tidak ada yang memaksa kedua hal itu bertemu.

- Jalur reset kini memperlakukan `index_conflict` seperti jalur verify: `ClaimConflictError` → `claim_conflict` → **409**, tanpa settlement, tanpa session. Pesan menyebut mana yang bentrok (email atau nomor WhatsApp) tanpa menyebut pemiliknya.
- Konflik dicatat sebagai `challenge.claim_conflict` stage `commit`, sama seperti verify.

**Acceptance test** (dua test, email dan phone, dengan rival account nyata — record lengkap, masuk `users`, memegang klaim, dan field-nya konsisten dengan datum yang diperebutkan): 409, **tanpa `Set-Cookie`**, jumlah session tidak bertambah, string record di Redis identik (`toBe` atas raw string), klaim tetap milik rival, guard challenge masih hidup, password lama masih berlaku dan password baru ditolak, lalu **kode yang sama berhasil** setelah klaim dilepas.

**Mutation check:** cabang `index_conflict` dihapus dari reset → kedua test merah di `expect(409)`. Dipulihkan setelahnya.

**Containment admin production · diaudit, tindakannya milik Anda.** `npm run audit:admins` (baru, read-only, memakai `KV_REST_API_READ_ONLY_TOKEN`) pada production:

```
user: 2 · alamat di ADMIN_EMAILS: 1
akun dengan role admin: 1
  a***@haluandigital.agency · provider=credentials · verificationSource=(tidak ada)
                            · kepemilikan terbukti=TIDAK · didukung allowlist=TIDAK
unprovenAdmins: 1
slot admin terbuka (alamat allowlist tanpa akun): 1
role admin tanpa dukungan allowlist: 1
```

Dua fakta yang lebih tajam daripada catatan containment di audit:

1. **Ada satu slot admin terbuka.** Satu-satunya alamat di `ADMIN_EMAILS` production **belum punya akun dan klaim emailnya kosong**. Di `215a1bf`, `createUser` memberi `role: "admin"` pada signup credentials yang emailnya cocok — dan karena provider email belum aktif di production, registrasi selesai tanpa verifikasi lalu langsung membuat session. Artinya siapa pun yang mendaftar dengan alamat itu **menjadi admin seketika**. Bukan teoretis, dan tidak butuh akses inbox.
2. **Admin yang ada tidak didukung allowlist.** `admin.tap@haluandigital.agency` bukan alamat allowlist itu. Di `215a1bf` role tersimpan tidak pernah dievaluasi ulang, jadi ia tetap admin; setelah working tree dipromosikan, `reconcileAdminRole` akan **mencabutnya** pada request admin berikutnya. Itu konsekuensi deploy yang perlu diketahui sebelum promosi, bukan kejutan sesudahnya.

**Tindakan termurah yang saya sarankan, dan hanya Anda yang bisa melakukannya:** hapus alamat yang belum terdaftar itu dari `ADMIN_EMAILS` production lalu redeploy (env Vercel baru berlaku setelah redeploy). Biayanya nol — alamat itu tidak dipakai akun mana pun — dan slotnya langsung tertutup tanpa perlu menutup registrasi. Kalau `admin.tap@haluandigital.agency` memang akun admin yang Anda pakai, masukkan alamat **itu** ke `ADMIN_EMAILS` supaya ia tetap admin setelah promosi. Saya tidak mengubah env production.

**Belum dikerjakan dari daftar 0–24 jam:** kapasitas GitHub Actions (di luar kendali saya) dan pembekuan paid acquisition/Resend/admin (keputusan Anda; kode tidak menyalakan apa pun).

## Status implementasi · remediasi putaran 18 · 17 Agustus 2026

Working tree tetap **HOLD**, Resend tetap **hard-blocked**. P1-nya saya reproduksi dengan dua akun nyata sebelum memperbaiki, lalu ulangi probe yang sama sesudahnya.

**R18-01 · P1 · selesai. Ini perubahan model, dan temuan Anda benar sampai ke akarnya.** Cacatnya bukan di recovery yang saya tambahkan — recovery hanya memperluas kesalahan yang sudah ada: **principal verifikasi dipilih dari alamat email publik.** Alamat email membuktikan siapa pembaca inbox, bukan akun mana yang dimaksud, dan beberapa akun bisa mengklaim alamat yang sama.

- `verify/request` untuk `purpose=verify` sekarang **wajib** membawa continuation proof 32 byte yang terikat `userId`. Tanpa itu tidak ada kode yang diterbitkan, dan penolakannya diaudit sebagai `verify.principal_unproven` supaya support melihat orang yang mungkin terkunci.
- Alamat tujuan dibaca dari **record**, bukan dari body request, jadi token yang bocor pun tidak bisa mengarahkan kode ke inbox pilihan penyerang.
- Dua jalur yang boleh menerbitkan proof: registrasi (klien baru membuat akun itu) dan **password check yang baru berhasil** di login. Keduanya mengikat ke satu `userId`.
- Pemulihan tanpa proof memakai **reset**, yang justru boleh berbasis email karena ia mengganti password, memasang `sessionsInvalidBefore`, mencabut session lama, dan menyelesaikan klaim dalam satu commit. Kepemilikan inbox tidak pernah mengaktifkan akun sambil mempertahankan credential pihak lain.
- **Klaim pendaftaran tidak lagi punya masa berlaku sendiri.** Ia dilepas oleh verifikasi (menjadi klaim permanen) atau oleh penghapusan record. TTL sendiri itulah yang membuka slot untuk akun pending kedua pada alamat yang sama.
- Agar itu tidak mengunci alamat selamanya: pendaftar berikutnya melepas klaim yang dipegang **record pending yang sudah lewat jendela satu jam** — kondisi yang sama dengan sweep, jadi sweep harian menjadi backstop, bukan satu-satunya jalan.
- Reset kini juga menulis klaim lewat script commit (dengan ownership check yang sama), sehingga record legacy ikut dipermanenkan saat pemiliknya pulih.

**R18-02 · P2 · selesai.** `findPendingUserByEmail` dan `assertPendingClaims` dihapus seluruhnya. Tidak ada scan `ZREVRANGE`/`MGET` di request path publik — bukan diperbesar batasnya, tapi dihapus, karena dengan klaim yang hidup selama record-nya, index email selalu menunjuk akun pending yang benar. Batas 500 dan audit `pending.scan_truncated` hilang bersamanya.

**R18-03 · P2 QA · selesai untuk isolasi, satu item terblokir.**

- Contract test menjalankan `redis-server` lewat **unix socket** di direktori `mkdtemp`, `--port 0`, tanpa persistence; bridge memakai port dari `listen(0)`; teardown `SIGTERM` lalu menunggu child exit dan membuang direktori temp; `FLUSHALL` diganti `FLUSHDB`. Tidak ada port yang bisa ditabrak.
- Bukti sentinel: `redis-server` eksternal di port 6479 dengan key `tap:sentinel` **tetap utuh** setelah `npm test` (`dbsize` tetap 1).
- Dua `npm test` paralel: **24/24 keduanya**. Untuk itu mock REST datastore di `tap-security` juga dipindah ke port 0 dan port aslinya dibaca dari stdout — port tetap 6399 membuat dua run berebut socket.
- Workflow GitHub memasang `redis-server` dan `redis-tools` sebelum `npm test`, dan mencetak versinya ke log.
- **Terblokir:** gate "run GitHub Actions hijau pada commit kandidat" tidak dapat saya penuhi karena working tree belum di-commit atau di-push. Perbaikannya sudah ada di workflow; buktinya baru bisa ada setelah promosi disetujui. Saya tidak menganggap item ini selesai.

**R18-04 · P3 · selesai.** Runbook tidak lagi menyebut klaim 30 atau 60 menit; ia menjelaskan klaim tanpa expiry, aturan continuation proof, pemulihan lewat reset, dan pelepasan klaim terbengkalai. Angka kandidat A17 yang benar adalah **24 unit/contract** dan **106 E2E** — koreksi Anda saya terima.

**Acceptance test.** Fixture rival sekarang **akun nyata**: record lengkap, masuk `users` dan `users:pending`, dan memegang index email — bukan dangling entry. Assertion membaca `userId` di dalam challenge JSON, bukan hanya status dan outbox. Empat test baru: challenge tidak pernah diarahkan ke akun pemegang index; pemulihan lewat reset mematikan password pihak lain; penolakan tanpa proof tercatat dan akun verified tidak dapat diarahkan ulang; klaim terbengkalai dilepas pendaftar berikutnya. Test TTL lama diganti test "klaim tidak punya masa berlaku sendiri".

**Mutation check** (semua dipulihkan setelahnya):

- Fallback `findUserByEmail` dikembalikan ke jalur verify → test pre-hijacking **merah**.
- Klaim pending diberi TTL satu jam → dua test **merah**.

**Probe P1 pada build hasil perbaikan** (paralel dengan probe reviewer):

```
register A: f53e8e55
register B setelah claim A dilepas: 41e1b594
email index sekarang dipegang: B (akun nyata)

verify/request hanya dengan email: 200
  challenge dibuat: tidak ada
  routedToRival: false
  email terkirim: 0

verify/request dengan continuation milik A: 200
  challenge user: f53e8e55 = A

pemulihan lewat reset: 200 | signedIn: true
  login dengan password pilihan B: 401
  login dengan password pemilik inbox: 200
  TTL claim email: -1
```

Putaran 18 mengukur `routedToRival: true` dan `attacker password still valid: true` pada probe yang sama.

## Remediasi audit putaran 18 · account pre-hijacking

Status board: **HOLD** untuk working tree, **HARD-BLOCKED** untuk Resend, skor kandidat **8,1/10**. Detail reproduksi dan matriks penerimaan ada di `AUDIT-PUTARAN-18.md`.

### A18.1 · P1 · jangan pilih principal verifikasi dari email publik

Acceptance A17 memakai dangling index (`email:{address}=rival-user` tanpa `user:rival-user`). Dengan dua akun pending nyata, `verify/request` memilih current index owner B, menerbitkan challenge B, lalu kode dari inbox memverifikasi B sementara password pilihan B tetap bisa login. Ini account pre-hijacking.

Paket perbaikan:

1. Bekukan `purpose=verify` berbasis email saja. Reissue verify harus membawa continuation proof berentropi tinggi yang terikat `userId`, atau berasal dari password check yang baru berhasil.
2. Recovery tanpa continuation proof memakai reset-style activation: code + password baru + `sessionsInvalidBefore` dalam atomic commit. Pemilik inbox tidak boleh mengaktifkan akun sambil mempertahankan credential pihak lain.
3. Pending email claim hidup sampai pending record benar-benar dihapus; cleanup dan rollback melepasnya ownership-safe. Claim tidak boleh hilang lebih dulu dan membuka slot duplicate pending account.
4. Tentukan migrasi duplicate pending/legacy secara eksplisit. Current email index tidak boleh otomatis menentukan pemenang.
5. Resend tetap hard-blocked sampai probe membuktikan challenge menuju principal yang benar dan password/session lama mati.

Acceptance wajib:

- A pending + B pending nyata dengan email sama;
- A pending + B verified nyata;
- request A tidak pernah menerbitkan challenge B;
- recovery tanpa continuation mengganti password dan mematikan session lama;
- reissue registrasi dengan continuation tetap satu challenge/satu session;
- dua recovery paralel tetap satu commit;
- receipt tetap purpose/payload-bound dan replay tidak mencetak session.

### A18.2 · P2 · hilangkan scan recovery 500 record

Probe 501 record membuktikan target tertua dilewatkan oleh `ZREVRANGE 0..499`: response 200, claim tetap kosong, email tidak terkirim. Request publik juga dapat menarik sampai 500 record user lewat `MGET`.

Ganti dengan lookup O(1) yang lifecycle-nya sama dengan pending record. Index baru harus mengikuti A18.1; ia bukan izin untuk mempertahankan password pihak lain. Tambahkan load test dan assertion bahwa public request tidak melakukan full/bounded user scan.

### A18.3 · P2 QA · isolasi Redis contract dan hidupkan CI

Contract test saat ini memakai port tetap 6479. Bila port itu sudah ditempati Redis lain, child test gagal bind tetapi `PING` server lama berhasil, lalu `FLUSHALL` dapat menghapus data yang bukan milik test.

1. Jalankan Redis lewat Unix socket unik di direktori temp, `--port 0`, tanpa persistence.
2. Bridge memakai port dinamis; teardown menunggu child exit dan membuang direktori temp.
3. Safety test: sentinel Redis eksternal tetap utuh; dua `npm test` paralel lulus.
4. Workflow GitHub memasang `redis-server` dan `redis-cli` secara eksplisit sebelum `npm test`, dengan versi/basis yang dicatat.
5. Gate selesai hanya dengan run GitHub Actions hijau pada commit kandidat.

### A18.4 · P3 · docs, coverage, dan angka gate

1. Runbook masih menyebut claim registrasi 30 menit; koreksi menjadi 60 menit dan selaraskan seluruh paragraf lifecycle.
2. Tambahkan respons operasional untuk `pending.scan_truncated` sampai scan dihapus.
3. E2E mengassert TTL email dan phone secara terpisah; mutation yang hanya menghapus renewal phone harus merah.
4. Angka aktual kandidat A17 adalah **24 unit/contract** dan **106 E2E**, bukan 23 unit.

### Gate pengangkatan HOLD putaran 18

1. Seluruh acceptance A18.1 lulus dengan rival record nyata.
2. Tidak ada scan 500 user pada request publik.
3. Contract Redis tidak dapat menyentuh instance eksternal.
4. GitHub Quality Gate remote hijau.
5. `npm run gate` hijau pada commit final, audit 0, dengan log dan sidecar SHA-256 yang dapat diperiksa.
6. Probe independen membuktikan principal, password, dan jumlah session benar.
7. Runbook cocok dengan lifecycle aktual; `git diff --check` bersih.

## Status implementasi · remediasi putaran 16 · 17 Agustus 2026

Enam gate reviewer untuk mengangkat HOLD. Working tree tetap **HOLD** dan Resend tetap **hard-blocked**.

**R16-01 · P2 · selesai.** Temuan ini benar dan lebih serius daripada namanya: `SET` tanpa pemeriksaan owner berarti verifikasi dapat memindahkan identitas orang lain ke akun ini. Script commit sekarang memeriksa setiap index **sebelum** tulisan pertama:

- Index kosong atau masih milik user yang sama → dipermanenkan.
- Index milik akun lain → `index_conflict` dengan nama index, diterjemahkan menjadi `claim_conflict` (`email` atau `phone`) dan **409** yang menyebut mana yang bentrok.
- Karena semua pemeriksaan mendahului tulisan pertama, penolakan tidak mengonsumsi guard, tidak menulis record, dan tidak membuat receipt.

Konsekuensi UX yang saya pilih secara sadar dan sudah dicatat di runbook: bentrok **nomor** juga memblokir verifikasi, bukan hanya bentrok email. Alternatifnya adalah memverifikasi email lalu menghapus nomor dari record secara diam-diam, dan mengubah data orang tanpa mereka tahu lebih buruk daripada menolak dengan jelas. Kode tetap hidup, jadi tidak ada yang perlu dikirim ulang setelah klaim dibebaskan.

**R16-02 · P3 · selesai.** `discardEmailChallenge` kini strict dan dipakai settlement; `tryDiscardEmailChallenge` best-effort hanya di rollback registrasi dan rollback verify/request. Klaim "seluruh housekeeping failure dicatat" sekarang benar.

**P3 lainnya:**

- **Membership mapping.** `USER_NOT_FOUND` → **404**, `TAP_DATASTORE_UNAVAILABLE` → **503**, sisanya **500**. Sebelumnya semua non-conflict menjadi 404.
- **Real lock takeover.** Test tidak lagi menggagalkan EVAL generik. Mock mendapat primitive `/__steal`: satu key ditulis ulang tepat sebelum command yang cocok berjalan, sehingga lease benar-benar berpindah dan **guard script sendiri** yang menolak. Test membuktikan 409, `stolen: 1`, guard masih hidup, record belum berubah, lalu retry sukses setelah lease dilepas.
- **Kontrak response paralel — satu kontrak, dipilih dan didokumentasikan.** Konfirmasi ganda **tidak pernah** mendapat 400. Satu commit dan signed in; yang lain acknowledged. Bila record sedang sibuk, yang kedua mendapat **409 sebagai instruksi retry, bukan sebagai outcome** — retry menghasilkan acknowledgment. Apa pun timing-nya, urutannya berakhir dengan tepat satu session. Test mengikuti kontrak itu (retry pada 409), dan runbook menyatakannya sama.
- **Artefak build.** `tsconfig.tsbuildinfo` dihapus dan masuk `.gitignore`.

**Acceptance test baru:** `verify menolak mengambil klaim email milik akun lain` (V4, termasuk kontrol positif — setelah klaim dibebaskan, kode yang sama tetap berhasil), `verify menolak mengambil klaim nomor WhatsApp milik akun lain` (V5), `kegagalan pembersihan challenge tercatat sebagai settlement debt`, `kegagalan datastore pada membership bukan 404`, dan `lease yang benar-benar berpindah menghasilkan 409 dan kode tetap hidup`.

**Mutation check.** Loop ownership dihapus dari script Lua dan dari mock, build ulang: V4 dan V5 keduanya gagal di `expect(409)`. Dipulihkan setelahnya.

**Tiga probe negatif** (`probe-r16.mjs`, dijalankan pada build hasil perbaikan):

```
--- Probe 1 · R16-01 ownership index ---
email owner sebelum verify: rival-user
phone owner sebelum verify: rival-user
verify: 409 | Email ini sudah dipakai akun lain. Hubungi tim Haluan...
email owner sesudah verify: rival-user
phone owner sesudah verify: rival-user
guard masih hidup (kode belum dikonsumsi): true
receipt dibuat: false

--- Probe 2 · R16-02 challenge cleanup observable ---
verify: 200
fault DEL benar-benar terpanggil: 1
challenge JSON masih ada: true
settlement queue: 1
step yang dicatat: [ 'challenge' ]
cron: 1 settled | challenge JSON sesudah cron: false

--- Probe 3 · membership error mapping ---
record hilang: 404 | Creator tidak ditemukan.
fault datastore terpanggil: 1
kegagalan datastore: 500 | Status membership belum dapat diubah. Coba kembali.
```

**Gate 6 terpenuhi.** `npm run qa` lima kali berurutan setelah perubahan terakhir: lint bersih, **15 unit test**, **0 vulnerability**, build sukses, dan **100 E2E lulus** setiap run (1,4–1,5 menit) — naik dari 92 karena lima acceptance test putaran 16. `git diff --check` bersih dan `tsconfig.tsbuildinfo` tidak lagi untracked.

## Status implementasi · remediasi putaran 15 · 17 Agustus 2026

Dikerjakan setelah keputusan reviewer "kerjakan sekarang". Working tree tetap **HOLD** dan Resend tetap **hard-blocked** sampai remediasi ini disetujui.

- **R14-01 · selesai.** `verifyEmailWithChallenge` dan `resetPasswordWithChallenge` mengembalikan tiga status yang tidak dapat saling tertukar: `committed` (satu-satunya yang boleh mencetak session), `acknowledged` (commit yang sama sudah mendarat), dan `rejected`. Jalur acknowledgment tidak membaca record user dan tidak membuat session; route menjawab `200 { signedIn: false }`, dan client mengarahkan ke form login dengan email yang sudah diketahui.
- **R14-01b · selesai.** Receipt diikat ke code + purpose + payload lewat `proof = sha256(id:code:purpose:payload)` dan menyimpan `v`, `purpose`, `userId`. Verify receipt tidak dapat dibaca di endpoint reset dan sebaliknya; replay dengan password berbeda ditolak 400 tanpa efek samping.
- **R14-02 · selesai.** Klaim email dan phone masuk ke dalam script commit (`__commit_with_challenge__` menerima key index tambahan), jadi record dan klaim permanennya mendarat bersama. Dibuktikan dengan `TTL tap:v1:email:{email}`: `> 0` saat registrasi, `-1` setelah verifikasi.
- **R14-03 · selesai.** Outcome `challenge_spent` sekarang membaca receipt tervalidasi, sehingga request kedua pada race mendapat acknowledgment, bukan false 400.
- **T15-01 · selesai.** Seluruh housekeeping setelah commit dijalankan `settleChallengeCommit` secara berurutan, bukan `Promise.all`: satu langkah gagal tidak membatalkan yang lain, tidak pernah lolos ke caller, dan dicatat ke `challenge-settlement:{userId}` + `tap:v1:challenge-settlements` + audit `challenge.settlement_pending`. Cron `cleanup-users` mengulangnya dan melaporkan `settlementsSettled`/`settlementsPending`. Panggilan strict/best-effort dipisah eksplisit: `releaseEmailSend` (strict) versus `tryReleaseEmailSend` (best-effort, dipakai rollback registrasi).
- **T15-02 · selesai.** `admin-role` menjadi langkah settlement bernama. Bila gagal, debt mencatatnya dan request admin berikutnya menerapkannya karena allowlist dievaluasi ulang setiap request — dibuktikan test.
- **Retry-safety revoke session.** `revokeSessionsInvalidatedBefore` hanya menghapus session yang record-nya sudah menolak (`createdAt < sessionsInvalidBefore`). Tanpa ini, retry cron beberapa menit kemudian akan menghapus session yang justru diberikan oleh reset itu sendiri.
- **P3 caller mapping.** `USER_NOT_FOUND` pada PATCH profil menjadi **404**; datastore failure tetap 500.
- **P3 inline reconciliation.** `reconcilePhoneClaims` di awal dan di catch `updateProfile` kini lewat `session.commit`; kegagalan di catch tidak menutupi error asli karena intent tetap di queue.
- **Rollback registrasi.** Penghapusan akun tidak lagi digabung `Promise.all` dengan pelepasan pointer: pelepasan yang gagal dulu bisa membatalkan penghapusan dan meninggalkan akun pending yang menahan alamatnya sendiri.
- **Harness.** `/__reset` membersihkan failure rules, `faultsFired`, dan `redisAvailable`; `/__faults` membuat fault hit dapat diassert; `TTL`/`PTTL` didukung; `/__forget-limits` memodelkan pergantian hourly bucket tanpa menggeser clock.

**Bukti.** `npx tsc --noEmit` bersih, lint bersih, build bersih, 15 unit test lulus, **92 E2E lulus tiga run berurutan** (naik dari 86: lima acceptance test baru). Probe P1 independen pada build hasil perbaikan:

```
session setelah verifikasi: 1
reset pertama: 200 | signedIn: true | session: 1
  replay 1: 200 | signedIn: false | session: 1
  replay 2: 200 | signedIn: false | session: 1
  replay 3: 200 | signedIn: false | session: 1
replay dengan password berbeda: 400
kode reset dipakai di endpoint verify: 400
login memakai password itu: 401
```

Putaran 15 mengukur 1 → 4 pada probe yang sama.

**Mutation check.** Dua test dibuktikan load-bearing dengan mengembalikan perilaku lama lalu build ulang: acknowledgment yang mencetak session menggagalkan test housekeeping, dan receipt tanpa ikatan purpose/payload menggagalkan test cross-purpose. Keduanya dipulihkan setelah pengujian.

**Acceptance test baru** (kelima permintaan reviewer, semuanya di `tests/e2e/auth-operations.spec.ts`):

1. `housekeeping yang gagal setelah commit tetap 200, dicatat, lalu diselesaikan cron` — fault tepat pada pelepasan send pointer setelah commit; response pertama 200 `signedIn: true`, `faultsFired` = 1, debt memuat step `send-pointer`, cron melaporkan `settlementsSettled: 1`.
2. Test yang sama — enam replay (tiga di antaranya setelah budget attempt di-reset untuk memodelkan pergantian bucket) semuanya 200 `signedIn: false`, dan `ZCARD user:{id}:sessions` tetap **1**. Session hasil reset selamat dari retry cron.
3. `grant admin yang gagal setelah commit dipulihkan pada request admin berikutnya` — fault pada penulisan role, verifikasi tetap 200, role masih `creator`, debt memuat `admin-role`, lalu `GET /api/admin/users` = 200 dan record menjadi `admin`.
4. `receipt hanya menjawab tujuan dan payload yang benar-benar commit` — cross-purpose 400, password berbeda 400, session tidak bertambah, password yang commit tetap yang berlaku (401 untuk yang lain).
5. `verifikasi memindahkan klaim email keluar dari masa berlaku pendaftaran` — `TTL` klaim email/phone `-1` setelah verifikasi.
6. `kode sekali pakai hanya mencetak satu session meski dikirim bersamaan` — ditulis ulang. Kontrak final ada di bagian putaran 16 di bawah. Assertion lama (satu 400) adalah false-400 R14-03 dan sudah tidak benar.

**Gate 16 terpenuhi.** `npm run qa` dijalankan **lima kali berurutan** setelah perubahan terakhir: masing-masing lint, 15 unit test, `npm audit` (0 vulnerability), build, dan **92 E2E lulus** — 1,3–1,4 menit per run E2E, tanpa flake. `git diff --check` bersih.

**Belum dikerjakan dan tetap terbuka:** Gelombang B (WebKit auth smoke, visual regression, performance budget), aktivasi Resend dan DNS, serta seluruh item ops dan bukti bisnis.

## Status implementasi · koreksi audit putaran 13

Kedua P2 dan ketiga P3 ditutup.

- **P13-01 · phone saga gagal aman.** Akarnya `deleteIfEquals` yang menelan error dan mengembalikan `false`, sehingga pelepasan yang gagal terlihat seperti selesai; alur lanjut menghapus intent dan mengembalikan 200. Sekarang helper itu **melempar**, dan varian best-effort `tryDeleteIfEquals` hanya dipakai pada pelepasan lease yang kegagalannya memang tidak mengubah apa pun. Intent hanya dihapus setelah pelepasan claim benar-benar terjadi, dan PATCH yang tidak dapat menyelesaikan pergantian mengembalikan **500** — bukan 200.

- **P13-02 · hasil OTP idempoten.** Script commit kini menulis **receipt** dalam operasi yang sama: satu key berisi `codeHash:userId` dengan TTL 30 menit. Bila langkah setelah commit gagal dan pemanggil mengulang kode yang sama, challenge sudah habis tetapi receipt cocok dengan kode itu, sehingga jawabannya hasil yang sama — 200, bukan "kode salah". Receipt terikat pada kode, jadi hanya pemegang kode yang dapat membacanya.

- **P13-03 · failure injection per fase.** `/__fail` menerima `match`, dicocokkan terhadap argumen command yang diserialisasi. Tes saga sekarang menggagalkan **tepat** pelepasan claim nomor lama (`match: "tap:v1:phone:6281234567877"`), dua kali, supaya perbaikan inline setelah kegagalan juga tidak berhasil dan pekerjaan benar-benar jatuh ke reconciler.

- **P13-04 · konflik membership.** Lock conflict pada `PATCH /api/admin/users` sebelumnya jatuh ke 404 "Creator tidak ditemukan"; sekarang 409 dengan pesan bahwa admin lain sedang memperbarui.

- **P13-05 · rollback email di createUser.** Raw `DEL` diganti compare-and-delete, jadi registrasi yang gagal karena nomor bentrok hanya melepas klaim email yang ia sendiri buat.

Tes baru:

- Saga digagalkan tepat di fase pelepasan → PATCH 500, intent bertahan, cron menyelesaikan; tepat satu claim tersisa dan cocok dengan record. Tes juga menuakan entri indeks melewati ambang lima menit, karena sapuan sengaja tidak menyentuh intent yang mungkin masih berjalan.
- Reset yang commit-nya sudah mendarat tetapi langkah sesudahnya gagal → pengulangan kode yang sama mengembalikan 200 dan login dengan kata sandi baru berhasil.

Kontrak kegagalan ditambahkan ke runbook: pergantian multi-key yang tidak selesai mengembalikan 500 dengan intent yang dipertahankan, dan kode yang diulang setelah commit mendarat mengembalikan 200 dari receipt.

## Status implementasi · koreksi audit putaran 12

Kelima item sebelum promosi dikerjakan.

1. **Compare-and-delete atomik untuk seluruh ownership key.** `lib/atomic.ts` menyediakan satu helper Lua yang dipakai bersama: pointer challenge email, claim nomor WhatsApp, pelepasan claim saat `deletePendingUser`, rollback claim, dan phone reconciler. Tidak ada lagi `GET` lalu `DEL` pada key kepemilikan, sehingga pemilik lama tidak dapat menghapus nilai milik penerusnya.

2. **Commit OTP atomik.** Satu script memeriksa token lock **dan** guard challenge, lalu mengonsumsi challenge serta menulis record user dalam satu operasi. Guard-nya adalah key string ringkas di samping record challenge, supaya perbandingan dapat dilakukan di dalam script tanpa mem-parsing JSON. Hasilnya tiga keluaran eksplisit: `committed`, `challenge_spent`, `lock_lost`. Untuk reset password, session lama dimatikan lewat `sessionsInvalidBefore` pada record — jadi tidak ada lagi penghapusan session sebelum commit, dan `getCurrentUser` menolak session yang lebih tua dari cap itu. Invariant tercapai: kode tetap hidup bila commit gagal.

3. **Mock datastore diperbaiki.** `SET ... PX` diimplementasikan — sebelumnya diabaikan, yang membuat setiap lease terlihat abadi dan melumpuhkan seluruh tes takeover. EVAL kini mengenali tiga script lewat penanda maksud, bukan menebak dari isi Lua. Ditambah failure injection per command (`POST /__fail`) agar saga dapat dihentikan di fase tertentu. Unit test baru memverifikasi expiry PX, takeover, renewal hanya oleh pemilik, pelepasan dengan token salah, dan stale guard.

4. **Guard wajib lewat konstruksi.** Lock tidak lagi mengekspos `guard()` yang bisa terlupa; ia memberikan `session.commit(write)` yang menjalankan pemeriksaan-plus-perpanjangan lalu penulisan. `updateSampleRequest` dan phone reconciler kini ikut. Reconciler juga mencoba ulang sendiri dan melaporkan `phoneClaimsContended` di heartbeat.

5. **Kontrak konflik disamakan.** Mutasi interaktif 409 dan aman diulang; job sistem retry lalu telemetry; not-found tetap 404; bentrok keunikan 409 dengan pesan tersendiri yang menyatakan retry tidak akan menolong. Klaim runbook yang menyatakan semua konflik selalu 409 dikoreksi menjadi tabel per pemanggil.

Tes penerimaan yang diminta board:

- Lock benar-benar ditahan dari luar → reset menerima 409 → kode yang sama berhasil 200 setelah lock dilepas, dan login dengan kata sandi baru berhasil.
- Commit digagalkan setelah challenge dibaca → tidak ada 409 dengan kode hilang; retry berhasil 200.
- Takeover pointer dan claim: unit test membuktikan pemegang lama gagal menghapus milik penerus.
- Saga dihentikan pada fase pelepasan claim lama dan fase pembersihan intent → cron memulihkan keduanya; tepat satu claim bertahan dan antrean intent kosong.
- Dua writer paralel pada profil tidak menghasilkan lost update (tes dari putaran sebelumnya tetap berlaku).

**Yang tetap terbuka dan disengaja.** Mutasi record biasa masih commit lewat lock, bukan lewat script — jadi jendela mikro antara pemeriksaan lease dan penulisan tetap ada untuk penulisan non-OTP. Menghilangkannya berarti memindahkan seluruh mutasi record ke Lua; itu keputusan arsitektur, dan yang bernilai tinggi (commit OTP) sudah dipindahkan.

## Status implementasi · koreksi audit putaran 11

Ketiga P2 dilaporkan ditutup. Audit putaran 12 menerima P11-02 dan menilai P11-01 serta P11-03 baru tertutup sebagian.

- **P11-01 · lock tidak atomik saat dilepas.** Release dan renewal record lock kini memakai script Lua satu langkah lewat `EVAL`. `withRecordLock` juga memberikan `guard()` yang memeriksa kepemilikan sekaligus memperpanjang lease. Sisa putaran 12: pointer email dan claim nomor masih `GET` lalu `DEL`, dua caller tidak memakai guard, dan mock mengenali EVAL tetapi belum menerapkan expiry `PX`.

- **P11-02 · intent hidup lebih pendek dari siklus perbaikannya.** Intent 15 menit melawan cron harian memang kedaluwarsa sebelum dibaca — persis meninggalkan orphan yang seharusnya ia jelaskan. TTL intent kini tujuh hari, jauh melampaui beberapa siklus sapuan, dan ambang "stale" untuk sapuan turun ke 5 menit. Selain itu `reconcilePhoneClaims` kini menghapus anggota indeks yang intent-nya sudah tidak ada, sehingga antrean tidak lagi menumpuk anggota mati.

- **P11-03 · OTP dikonsumsi sebelum lock.** Acquisition conflict sudah tertutup: challenge di-peek, lock diambil, lalu kode dikonsumsi di dalam critical section. Sisa putaran 12: consume masih terjadi sebelum `guard()`, sehingga lease takeover setelah acquisition dapat menghasilkan 409 dengan challenge yang sudah hilang.

Dua E2E baru: dua reset paralel dengan kode yang sama (tepat satu 200, tidak pernah 500, dan login dengan kata sandi baru berhasil), serta pergantian nomor yang tidak meninggalkan anggota indeks mati.

Tenggat tertulis untuk pengecualian admin legacy ditambahkan ke runbook: pemilik, pemicu, tenggat 24 jam sejak Resend aktif, bukti yang harus ada, tindakan bila terlewat, dan gate keras `unprovenAdmins` nol sebelum paid acquisition.

**Catatan cakupan yang tetap terbuka.** `guard()` mempersempit jendela commit setelah lease lapse, tetapi ini bukan fencing token sejati — datastore tidak menolak penulisan basi atas namanya sendiri. Menutupnya sepenuhnya memerlukan seluruh mutasi record dipindahkan ke dalam script Lua, dan itu keputusan arsitektur tersendiri, bukan tambalan.

## Status implementasi · Gelombang A putaran 10

Status historis: selesai sebagian. PATCH parsial, fail-closed registrasi, deduplikasi audit, cakupan writer, dan dua E2E baru terkonfirmasi. Klaim compare-and-delete serta recovery saga dikoreksi oleh audit putaran 11 dan kembali masuk Gelombang A1.

## Status implementasi · remediasi audit putaran 8

Ketiga temuan ditutup, plus dua item backlog QA.

- **R8-01 (P1) · pemberian admin tanpa bukti kepemilikan email.** Ada dua jalur pemberian, dan keduanya ditutup. `createUser` tidak lagi memberi role admin pada pendaftaran credentials meski emailnya ada di allowlist — hanya Google, satu-satunya jalur yang membuktikan kepemilikan saat pembuatan akun. `reconcileAdminRole` kini memisahkan tiga keputusan: pencabutan tetap tanpa syarat, pemberian menuntut `emailVerifiedAt` dengan sumber `code` atau `google`, dan penolakan dicatat sebagai `admin.grant_blocked` beserta alasannya. Verifikasi email berhasil langsung memicu rekonsiliasi, jadi operator yang sah naik tepat setelah membuktikan alamatnya.

  **Keputusan yang berbeda dari rekomendasi audit:** admin yang *sudah* terpasang tidak diturunkan hanya karena buktinya lemah. Menurunkan mereka akan mengunci tim dari production hari ini, karena provider email belum aktif sehingga tidak ada jalan naik kembali. Sebagai gantinya, akun admin tanpa bukti ditampilkan sebagai peringatan di workspace admin lengkap dengan sumber verifikasinya, dan runbook meminta mereka melakukan reset kata sandi agar naik ke `code`. Begitu Resend hidup, daftar itu harus kosong.

- **R8-02 (P2) · indeks WhatsApp.** Mengosongkan nomor kini dihitung sebagai perpindahan sehingga klaim lama dilepas, dan kegagalan penulisan setelah klaim baru melepaskan klaim itu kembali sebelum error dilempar. Pelepasan selalu memeriksa kepemilikan lebih dulu, jadi klaim milik akun lain tidak pernah tersentuh.

- **R8-03 (P2) · race cooldown reset.** Cooldown terpisah dihapus. Satu operasi atomik `SET NX` sekarang menetapkan sekaligus siapa yang boleh mengirim dan challenge mana yang dimiliki alamat itu, sehingga pemenang mengirim dan yang kalah selalu membaca id yang benar-benar tersimpan — bukan id acak. Bila pengiriman gagal, challenge dan pointer-nya dihapus supaya alamat itu bisa mencoba lagi seketika. Jendela kirim ulang 5 menit lebih pendek dari masa berlaku kode 30 menit, jadi kode lama tetap sah sementara pengguna bisa meminta yang baru.

- **QA · WebKit ditambahkan.** Profil `mobile-webkit` (iPhone 14) menjalankan spec publik dan aksesibilitas; alur operator tetap di Chromium karena yang berbeda antarengine adalah rendering, bukan siklus datastore. Penambahan ini langsung menemukan dua hal nyata: `upgrade-insecure-requests` dipatuhi WebKit bahkan untuk `http://localhost` sehingga seluruh fetch same-origin gagal — direktif itu kini hanya dikirim pada origin https — dan **kartu pertama homepage berada di 679px pada viewport iPhone 664px**, jadi target satu layar ternyata hanya terpenuhi di ukuran Android. Hero dipadatkan khusus untuk layar pendek; sekarang 470px di iPhone 14 dan 652px di Pixel 7.

Belum dikerjakan: visual regression, performance budget, dan synthetic production flow. Trigger indeks pencarian admin ditetapkan di bawah.

## Status implementasi · remediasi audit putaran 7

Delapan dari sepuluh temuan putaran 7 ditutup di kode.

- **R7-01 (P1) · pencabutan akses admin.** `ADMIN_EMAILS` sekarang menjadi otorisasi dinamis pada setiap permintaan admin, bukan sekadar bootstrap role. Ketika email keluar dari allowlist, role tersimpan diturunkan, **seluruh session akun itu dihapus**, dan audit `admin.revoked` dicatat dengan aktor `system:allowlist`. Berlaku dua arah: menambahkan email memberi akses pada permintaan berikutnya dan mencatat `admin.granted`. E2E menguji akun ber-role admin yang tidak ada di allowlist: 403, role kembali `creator`, sesi mati.
- **R7-02 (P2) · konsumsi OTP atomik.** Challenge hanya dianggap terpakai bila `DEL` benar-benar menghapusnya, sehingga dua konfirmasi paralel hanya menghasilkan satu keberhasilan. Kode salah tidak pernah sampai ke titik itu, jadi challenge yang benar tidak ikut habis. E2E mengirim dua reset paralel: tepat satu 200, satu 400.
- **R7-03 (P2) · indeks nomor WhatsApp.** Perubahan nomor di profil kini mengklaim nomor baru dengan `NX`, menulis record, lalu melepas klaim lama hanya jika masih miliknya. Bentrok mengembalikan 409 dengan pesan yang jelas.
- **R7-04 (P2) · periode metrik.** Total dan rincian per campaign sama-sama lifetime, memakai counter yang menyemai dirinya dari counter campaign yang sudah ada. Event tetap disimpan 180 hari untuk investigasi, dan angka itu ditampilkan terpisah dengan label periodenya.
- **R7-05 (P2) · dokumentasi.** Satu klasifikasi paparan link ditetapkan di README, product reference, readiness, dan severity runbook: katalog teragregasi publik, link campaign individual publik dan throttled, feed operasional privat. Link publik per campaign bukan insiden; feed operasional atau PII yang bocor adalah SEV-1.
- **R7-06 (P2) · kunci reset.** Kuota per alamat diganti cooldown 60 detik. Permintaan di dalam cooldown mengembalikan challenge yang sedang hidup, jadi pemilik akun selalu bisa memakai kode yang sudah ada di inboxnya dan tidak pernah terkunci. Percobaan kode dibatasi per IP (10/jam) terpisah dari per challenge (30/jam), sehingga tebakan penyerang tidak menghabiskan jatah korban.
- **R7-07 (P3) · heartbeat cron.** Status `succeeded`/`failed` beserta durasi, jumlah terhapus, dan kelas error ditulis ke key tetap, dibaca langsung oleh admin, dan ditandai merah bila lebih tua dari 26 jam. Tidak lagi bergantung pada 100 audit event terakhir.
- **R7-08 (P3) · presedensi verifikasi.** `grandfathered`/`migrated` selalu kalah dari `code`/`google`, jadi akun yang menyelesaikan reset dengan kode benar-benar naik labelnya.

Belum dikerjakan: **R7-09** (indeks sekunder untuk pencarian admin) dan sisa **R7-10**. Trigger R7-09 ditetapkan eksplisit: kerjakan begitu **jumlah creator atau request menembus 10.000 record**, atau **p95 endpoint admin melewati 500 ms**, mana yang lebih dulu. Di bawah ambang itu, full-scan pada cache miss lebih murah daripada indeks yang harus dijaga konsistensinya.

## Status implementasi · 17 Agustus 2026

**Gelombang A selesai (A1–A4), ditambah B1a, B1b, dan polish halaman brand.**

Batch kedua hari ini:

- Pola cache filter diangkat ke `lib/filter-cache.ts` dan dipakai bersama oleh daftar creator dan daftar request sample. Daftar request sebelumnya punya tiga kelemahan yang sama persis, dan yang paling menggigit: revision-nya memakai `ZCARD` sehingga **perubahan status sample — pekerjaan admin paling sering — tidak membatalkan cache sama sekali**.
- **B1b:** akun pending punya indeks `users:pending` berkunci waktu mulai verifikasi. Sapuan malam memakai `ZRANGEBYSCORE`, bukan lagi menarik seluruh tabel user. Script backfill mengindeks akun pending lama supaya tidak ada yang tertinggal.
- **B1a:** kuota kode naik dari 3 ke 5 per jam per alamat, ditambah batas 20 per jam per IP. Keduanya dihitung sebelum pencarian akun, jadi penolakan tidak pernah membocorkan apakah alamat terdaftar. Pesannya menyebut sisa waktu dan mengingatkan kode yang sudah terkirim tetap berlaku; `Retry-After` juga dipasang di login dan registrasi.
- Halaman brand: rate tidak lagi tampil dua kali, dan tombol bagikan turun ke bawah daftar link — menyalin link adalah pekerjaannya, membagikan halaman adalah lanjutannya.

**Batch pertama (A1–A4).** Cache filter admin sekarang berkunci ganda — penghitung revisi bersama di datastore untuk menangkap perubahan lintas instance, plus `ZCARD` untuk menangkap penulisan yang melewati aplikasi (script migrasi, perbaikan manual) — ditambah sapuan entri kedaluwarsa dan batas 32 entri. Setiap akun kini menyimpan `verificationSource` (`code`, `google`, `migrated`, `grandfathered`) yang tampil sebagai kolom Verifikasi di Database Kreator. Cron pembersih mencatat hasilnya ke audit log dan waktu jalan terakhirnya tampil di header Audit Log. Mode email developer — `test` maupun `local` — ditolak ketika `VERCEL_ENV=production`.

Gate diverifikasi ulang setelah kedua batch: `npm run qa` **5/5 hijau**, 45 E2E per run, 13 unit test, nol kerentanan.

Sisa: B1 dan B2 (menunggu kunci Resend dan DNS), C (ops/aset), dan D (bukti bisnis). Seluruh pekerjaan engineering yang tidak memerlukan input eksternal sudah selesai.

## Status implementasi · putaran 6

Ketiga masalah production putaran 5 tertutup dan terverifikasi di situs live: gate login jadi bersyarat sehingga akun lama bisa masuk, canonical/sitemap/og:image menunjuk domain hidup, dan region fungsi pindah ke `sin1` sehingga TTFB turun dari 0,82–1,08 detik ke 0,19–0,23 detik. Empat temuan lain — cakupan CSP, mode test OTP, registrasi atomik, SSR form login — juga tertutup, ditambah cron pembersih user yatim dan cache filter admin.

QA lima kali hijau dengan 45 E2E, smoke production 9/9, nol kerentanan. Automated QA mencapai 10/10 untuk pertama kalinya.

**Sisa jarak ke 10 sebagian besar bukan pekerjaan engineering.** Tiga area terendah — data integrity 8, visual identity 7, trust & proof 6 — semuanya ops, aset, dan bukti bisnis.

---

## Gelombang A — pengerasan sisa · ±½ hari

### A1 · P2 · Cache filter admin lintas instance

**Kenapa.** `lib/auth.ts:13` menyimpan hasil filter di `Map` tingkat modul. Tiga konsekuensi: (1) `userFilterCache.clear()` hanya membersihkan instance yang menangani penulisan, sehingga instance lain bisa menyajikan data lama sampai 30 detik; (2) revision key memakai `ZCARD` yang tidak berubah ketika membership atau profil diubah; (3) entri hanya kedaluwarsa secara logis dan tidak pernah dihapus, sementara tiap entri memegang array `TapUser` lengkap termasuk alamat dan nomor HP.

**Langkah.** Pindahkan cache ke Redis dengan TTL 30 detik agar invalidasinya lintas instance. Kalau tetap di memori: tambahkan sapuan entri kedaluwarsa dan batas jumlah entri.

**Selesai bila.** Verifikasi membership langsung terlihat pada permintaan berikutnya, dan jumlah entri cache punya batas atas.

### A2 · P3 · Jejak asal verifikasi

**Kenapa.** Tiga jalur menghasilkan `emailVerifiedAt` identik: user yang benar-benar memasukkan kode, user lama yang di-backfill, dan user yang mendaftar ketika provider email mati. Begitu Resend aktif, tidak ada cara mengetahui akun mana yang pernah membuktikan kepemilikan email.

**Langkah.** Tambahkan `verificationSource: "code" | "migrated" | "grandfathered"` di `lib/models.ts`; isi di `createUser`, `verifyUserEmail`, dan `scripts/backfill-email-verified.mjs`. Tampilkan di kolom admin.

**Selesai bila.** Admin bisa memfilter akun berdasarkan asal verifikasinya.

### A3 · P3 · Cron tidak gagal senyap

**Kenapa.** `app/api/cron/cleanup-users/route.ts` mengembalikan 401 baik ketika secret salah maupun ketika `CRON_SECRET` tidak diset. Kalau env itu belum terpasang, job harian gagal selamanya tanpa ada yang tahu.

**Langkah.** Catat hasil (`removed`, durasi) lewat `recordAudit` yang sudah ada, dan tampilkan waktu jalan terakhir di layar Audit Log admin.

**Selesai bila.** Layar admin menampilkan kapan cron terakhir berhasil.

### A4 · P3 · Kunci mode email lokal

**Kenapa.** `emailTestModeEnabled()` sudah dikunci `NODE_ENV`, tapi `localEmailModeEnabled()` tidak. Bukan kerentanan — OTP tidak bocor — tapi kalau `AUTH_EMAIL_MODE=local` terpasang di production, gerbang verifikasi login menyala sementara setiap pengiriman gagal ke localhost.

**Langkah.** Tambahkan syarat `NODE_ENV !== "production"` di `lib/email-mode.ts:9`.

---

## Gelombang B — aktivasi · menunggu input eksternal

### B1 · Aktifkan provider email

Pasang `RESEND_API_KEY` dan `EMAIL_FROM` di Vercel production, verifikasi domain pengirim di Resend. Setelah aktif:

- **B1a · P3 · Kuota reset.** `verify/request` dibatasi 3 permintaan per jam per alamat email, sehingga penyerang yang tahu email korban bisa memblokir reset selama satu jam. Naikkan ke 5, pisahkan hitungan antara permintaan yang benar-benar mengirim email dan yang tidak, dan beri pesan yang menyebut sisa waktu.
- **B1b · P3 · Plafon cleanup.** `cleanupExpiredPendingUsers` menarik seluruh tabel user ke memori. Aman sekarang; sebelum puluhan ribu creator, ganti dengan sorted set khusus user pending berkunci `emailVerificationStartedAt` lalu sapu dengan `ZRANGEBYSCORE`.

### B2 · Aktifkan domain

Aktifkan DNS `tap.haluandigital.agency`, tambahkan domain di Vercel, pindahkan `NEXT_PUBLIC_SITE_URL`, pasang redirect 301 dari domain lama. Smoke `canonical host is live` akan menangkap kalau ada yang tertinggal.

### B3 · Jalankan ulang gate

`npm run gate` setelah B1 dan B2; simpan log dan sidecar SHA-256 bersama bukti rilis.

---

## Gelombang C — ops dan aset · paralel

| # | Task | Ukuran sekarang | Target |
|---|---|---|---|
| C1 | Lengkapi logo brand dari `BRAND-LOGO-GAPS.md` | 64% brand unik (TikTok 60%, Shopee 71%) per 18 Agustus 2026 | di atas 85% |
| C2 | 22 campaign tidak tayang karena format rate | 50 sel bermasalah pada 35 brand, termasuk Maybelline dan Implora | pemilik + tenggat, lalu nol |
| C3 | Konfirmasi tertulis intake sample Shopee | 284 dari 383 brand ditandai "Sample tersedia" | jalur terkonfirmasi atau badge dimatikan |
| C4 | Kolom `Berlaku hingga` di master sheet | 0 dari 310 record | terisi; parser sudah siap |

---

## Gelombang D — bukti bisnis · syarat paid acquisition

Satu campaign closed beta dijalankan sampai tuntas, dengan bukti settlement yang boleh dipublikasikan: berapa creator, berapa GMV, berapa komisi yang benar-benar dibayarkan, dan berapa lama sample sampai.

Ini satu-satunya jalan menaikkan Trust & proof dari 6, dan setelah enam putaran ini adalah risiko terbesar yang tersisa — bukan risiko teknis. Produk sudah siap secara teknis; yang belum ada adalah buktinya.

---

## Urutan pengerjaan

1. **A1–A4** — setengah hari, tidak saling bergantung, tidak menunggu siapa pun.
2. **C1–C4** — jalan paralel sejak sekarang; tidak butuh engineering.
3. **B1–B3** — begitu kunci Resend dan DNS tersedia.
4. **D** — jalankan closed beta segera setelah B1, karena inilah jalur kritis menuju paid acquisition.

---

## Checklist historis 10 poin — bukan skor RC saat ini

| # | Gate | Status | Task |
|---|---|---|---|
| 1 | Satu `npm run gate` dengan `runs wajib: 5`, `run lengkap: 5/5`, dan artifact yang dapat diverifikasi | Ditentukan oleh artifact exact-SHA, bukan status statis di dokumen ini | — |
| 2 | Fitur yang bisa dimatikan lewat env punya e2e pembuktinya | **Terpenuhi** | — |
| 3 | Kegagalan satu dependency tidak mematikan jalur lain | **Terpenuhi** | — |
| 4 | Tidak ada angka di UI tanpa sumber | **Terpenuhi** | — |
| 5 | Tidak ada PII ke browser melebihi yang ditampilkan | **Terpenuhi** | — |
| 8 | Perubahan yang memutus kompatibilitas data punya backfill dan tes migrasi | **Terpenuhi** | — |
| 9 | Setiap URL kanonik yang diterbitkan menunjuk host yang resolve | **Terpenuhi** | — |
| 6 | Setiap record yang tidak tayang punya pemilik dan tenggat | Separuh | C2 |
| 7 | Creator bisa daftar, verifikasi, reset password, lihat deal tanpa menggulir | Menunggu | B1 |
| 10 | Setiap klaim publik tentang hasil creator punya bukti yang dapat diaudit | Belum | D |
