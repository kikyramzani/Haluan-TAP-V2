# TAP by Haluan — Builder Handoff Putaran 14

Dokumen ini adalah spesifikasi kerja sebelum working tree boleh dipromosikan. Source of truth temuan ada di `AUDIT-PUTARAN-14.md`; urutan prioritas lintas putaran ada di `IMPROVEMENT-PLAN.md`.

## Outcome yang diminta

Setelah perubahan:

1. OTP benar-benar one-time untuk autentikasi. Receipt tidak dapat membuat session baru.
2. Receipt hanya mengakui operasi dengan purpose dan payload yang sama.
3. Verify tidak dapat committed tanpa email/phone lookup yang durable.
4. Cleanup challenge yang gagal tidak menyembunyikan receipt.
5. Phone saga tetap recoverable dan holder stale tidak menyentuh intent penerus.
6. Test suite membuktikan setiap invariant dengan fault pada fase yang tepat.

Estimasi engineering: **±1–1½ hari**, termasuk tes dan dokumentasi. Jangan promosikan sebagian paket auth; perubahan receipt, route response, UI handling, dan test contract harus masuk sebagai satu batch.

## Invariant wajib

### Auth

- Satu challenge hanya boleh menghasilkan satu state transition.
- Receipt adalah acknowledgment, bukan kredensial session.
- Receipt `verify` tidak sah pada route `reset`, dan sebaliknya.
- Reset replay dengan password berbeda tidak boleh mendapat 200.
- Receipt replay tidak menambah jumlah session.
- Wrong code tidak dapat membaca receipt.
- Challenge yang belum committed tetap dapat dipakai setelah lock conflict atau datastore failure.
- Challenge yang sudah committed menghasilkan acknowledgment konsisten meski response awal hilang.

### Verification index

- User tidak boleh berstatus verified sementara email/phone claim masih punya TTL registrasi.
- Email/phone index tidak boleh direbut dari owner lain.
- Jika index sudah hilang tetapi belum dimiliki pihak lain, verify commit boleh mengklaimnya kembali secara atomik.
- Jika index dimiliki pihak lain, challenge tidak dikonsumsi dan konflik harus terlihat.

### Phone saga

- Record user adalah source of truth.
- Intent bertahan sampai old claim dan final claim konsisten dengan record.
- Holder yang kehilangan lease tidak melakukan inline repair.
- Cron hanya menyapu intent yang lebih tua dari lima menit.

## Work package A — receipt schema dan result contract

**File utama:** `lib/email-auth.ts`, `lib/auth.ts`.

Ganti receipt string `codeHash:userId` dengan payload versi yang minimal berisi:

```text
version
purpose: verify | reset
userId
codeHash
committedAt
mutationFingerprint
```

Receipt tetap ditulis atomik bersama commit dan tetap memiliki TTL. Reader wajib menerima expected purpose:

```text
readChallengeReceipt(challengeId, code, expectedPurpose)
```

Reader menolak:

- code hash salah;
- purpose salah;
- schema/version tidak dikenal;
- user tidak ada;
- mutation fingerprint tidak lagi cocok.

Untuk reset, fingerprint harus membuktikan password yang committed. Jangan menyimpan password mentah atau digest password yang murah ditebak. Opsi yang paling sederhana dengan primitive sekarang:

1. receipt menyimpan fingerprint dari password hash salted yang benar-benar ditulis;
2. replay membaca user saat ini;
3. replay memastikan fingerprint current `passwordHash` masih sama;
4. replay menjalankan `verifyPassword(passwordDariRequest, user.passwordHash)`.

Dengan begitu password berbeda mendapat 409/400, dan receipt lama tidak mengakui reset yang sudah ditimpa reset berikutnya.

Ubah return type auth menjadi discriminated result, misalnya:

```text
{ kind: committed, user }
{ kind: replayed, user }
null
```

Jangan lagi mengembalikan `TapUser | null` karena caller perlu membedakan state transition baru dari acknowledgment.

## Work package B — session semantics pada replay

**File utama:**

- `app/api/auth/verify/confirm/route.ts`
- `app/api/auth/password/reset/route.ts`
- `app/daftar/AuthClient.tsx`

Aturan route:

| Result | Session baru | HTTP | UX |
|---|---:|---:|---|
| `committed` | ya, satu kali | 200 | lanjut ke destination |
| `replayed` | **tidak** | 200 | beri tahu operasi sudah selesai; arahkan login |
| invalid/wrong code | tidak | 400 | pesan kode salah/kedaluwarsa |
| purpose/payload mismatch | tidak | 409 atau 400 konsisten | jelaskan operasi sudah dipakai untuk request lain |
| lock conflict sebelum commit | tidak | 409 | kode tetap berlaku |

`AuthClient` tidak boleh selalu menjalankan `window.location.assign(payload.returnTo)`. Bila response menyatakan `replayed` atau `authenticationRequired`, pindahkan user ke mode login dan tampilkan pesan natural, misalnya bahwa perubahan sudah tersimpan dan user perlu masuk kembali.

Jika `createSession` gagal setelah commit pertama, route boleh mengembalikan response yang menyatakan state sudah tersimpan tetapi login ulang diperlukan. Jangan mengubah committed auth operation menjadi generic 500 yang mendorong user mengulangi password tanpa konteks.

## Work package C — commit verify atomik dan durable

**File utama:** `lib/atomic.ts`, `lib/auth.ts`, `tests/helpers/mock-redis.mjs`.

Buat script khusus verify atau mode eksplisit pada script commit. Dalam satu EVAL:

1. periksa lock token;
2. periksa challenge guard;
3. periksa email claim: harus milik user atau kosong;
4. periksa phone claim bila ada: harus milik user atau kosong;
5. bila claim dimiliki akun lain, return outcome khusus tanpa mengonsumsi challenge;
6. hapus challenge guard;
7. hapus JSON challenge;
8. tulis user verified;
9. tulis email claim tanpa TTL;
10. tulis phone claim tanpa TTL bila ada;
11. hapus user dari `users:pending`;
12. tulis receipt purpose-bound dengan TTL;
13. return `committed`.

Redis `SET key value` tanpa expiry dapat dipakai untuk membuat claim permanen setelah ownership check dalam script. Jangan melakukan `GET` lalu `SET` di request terpisah.

Untuk reset, script juga harus menghapus JSON challenge, bukan hanya guard. Reset tidak perlu menyentuh email/phone index.

Tambahkan outcome eksplisit untuk:

- `committed`;
- `lock_lost`;
- `challenge_spent`;
- `email_claim_conflict`;
- `phone_claim_conflict`.

Pada outcome `challenge_spent`, caller melakukan receipt lookup yang tervalidasi. Ini defense-in-depth jika ada data lama atau cleanup dari deployment sebelumnya.

## Work package D — post-commit cleanup

**File utama:** `lib/auth.ts`, `lib/email-auth.ts`, ops telemetry terkait.

Pisahkan critical commit dari housekeeping.

Critical untuk verify:

- user record;
- challenge consumption;
- challenge JSON deletion;
- receipt;
- email/phone ownership index;
- pending index.

Critical untuk reset:

- user record dan password hash;
- `sessionsInvalidBefore`;
- challenge consumption;
- challenge JSON deletion;
- receipt.

Housekeeping setelah commit:

- cooldown pointer cleanup;
- physical deletion session keys;
- cache revision;
- audit/telemetry tambahan.

Housekeeping failure tidak boleh mengubah commit sukses menjadi false failure. Gunakan `Promise.allSettled` atau helper eksplisit, lalu catat kegagalannya. Security reset tetap ditopang `sessionsInvalidBefore`; physical session deletion dapat diulang kemudian.

Jangan menjadikan email/phone index sebagai best-effort. Itu bagian critical verify.

## Work package E — phone reconciliation dan stale holder

**File utama:** `lib/auth.ts`, `lib/mutation.ts` bila perlu.

Perubahan yang diminta:

- Jalankan reconciliation awal profile melalui `session.commit(() => reconcilePhoneClaims(...))`.
- Di catch, coba inline repair hanya melalui `session.commit`.
- Jika guard gagal karena lease sudah berpindah, jangan jalankan repair tanpa lock. Tinggalkan intent untuk writer aktif atau cron.
- Jangan menurunkan stale threshold lima menit.
- Jangan menghapus intent jika strict ownership release atau final claim check melempar.

Ini menutup stale-holder cleanup tanpa memindahkan seluruh mutasi record biasa ke Lua. Full fencing token untuk semua writer tetap di luar scope batch ini.

## Work package F — mock dan failure injection

**File utama:** `tests/helpers/mock-redis.mjs`, `tests/tap-security.test.mjs`.

Tambahkan kemampuan berikut:

1. `__reset` juga menjalankan `failures.length = 0` dan mengembalikan dependency flags ke default.
2. Failure rule melaporkan hit count atau endpoint menyediakan assertion bahwa rule benar-benar terpanggil.
3. Tambahkan action takeover: ketika command/script/key cocok, ganti lock token sebelum script dieksekusi sehingga outcome nyata `lock_lost`, bukan HTTP error EVAL.
4. Implementasikan command yang dipakai script baru.
5. Tambahkan `TTL`/`PTTL`, atau inspection endpoint test-only, agar tes dapat membedakan permanent claim dari claim yang masih memiliki expiry.
6. Selector tetap dapat memakai command + match, tetapi tes harus memilih script tag dan key yang unik.

Test fault tidak boleh menerima dua status jika fault yang ditarget deterministik. Jika expected failure adalah 500, assert tepat 500.

## Work package G — route error mapping dan dokumentasi

**File utama:** `app/api/admin/users/route.ts`, `OPERATIONS-RUNBOOK.md`, `IMPROVEMENT-PLAN.md`.

- Membership: `MutationConflictError` → 409, `USER_NOT_FOUND` → 404, datastore/unknown → 500 atau 503.
- Runbook: ubah definisi receipt. Receipt mengakui commit yang sama; tidak membuat session; purpose dan payload harus cocok.
- Dokumentasikan bahwa replay dapat meminta login ulang.
- Dokumentasikan bahwa verification indexes committed atomik, bukan housekeeping.
- Setelah implementasi, koreksi status historis P13-02 menjadi “ditutup pada putaran 14” hanya jika seluruh acceptance test di bawah lulus.

## Acceptance test matrix

### Receipt dan auth

| # | Skenario | Expected |
|---|---|---|
| A1 | Verify normal | 200, user verified, satu session |
| A2 | Reset normal | 200, password baru aktif, satu session baru |
| A3 | Replay verify dengan code sama | 200 acknowledgment, **session count tidak naik** |
| A4 | Replay reset dengan password sama | 200 acknowledgment, session count tidak naik |
| A5 | Replay reset dengan password berbeda | 409/400, password pertama tetap aktif, tidak ada session baru |
| A6 | Receipt verify dikirim ke reset | 409/400, password tidak berubah, tidak ada session baru |
| A7 | Receipt reset dikirim ke verify | 409/400, tidak ada session baru |
| A8 | Wrong code terhadap receipt | 400, tidak ada session baru |
| A9 | Dua reset paralel, payload sama | satu commit; response konsisten; session side effect maksimal satu |
| A10 | Dua reset paralel, payload berbeda | satu winner; loser bukan 200; hanya password winner aktif |
| A11 | Receipt kedaluwarsa | replay 400; password committed tetap dapat dipakai login |

### Commit dan cleanup

| # | Skenario | Expected |
|---|---|---|
| C1 | Lock ditahan sebelum reset | 409; code sama berhasil setelah lock lepas |
| C2 | Lock token diganti tepat sebelum commit | `lock_lost`; code tetap hidup; tidak ada record write |
| C3 | EVAL commit gagal transport | non-200; code tetap hidup |
| C4 | Challenge JSON cleanup fault | tidak relevan karena JSON dihapus dalam commit; replay acknowledgment tetap benar |
| C5 | Physical session sweep gagal setelah reset | reset tetap dianggap committed; old session ditolak oleh cutoff |
| C6 | Cache revision gagal | auth outcome tetap benar |

### Verification index

| # | Skenario | Expected |
|---|---|---|
| V1 | Verify normal | email dan phone claim memiliki TTL `-1`/permanent |
| V2 | Commit verify gagal sebelum script selesai | code tetap hidup; user belum verified |
| V3 | Email claim kosong saat commit | direbut atomik oleh user yang sama, lalu permanent |
| V4 | Email claim dimiliki user lain | conflict; code tidak habis; user tidak verified |
| V5 | Phone claim dimiliki user lain | conflict; code tidak habis; user tidak verified |
| V6 | Receipt replay verify | tidak mengubah ownership dan tidak menambah session |

### Phone saga dan caller

| # | Skenario | Expected |
|---|---|---|
| P1 | Old-claim release gagal dua kali | PATCH 500; intent bertahan; cron memulihkan satu claim |
| P2 | Inline repair berhasil setelah release gagal | PATCH 500 atau kontrak eksplisit; state konsisten; retry aman |
| P3 | Lease takeover sebelum inline repair | holder lama tidak menyentuh intent penerus |
| P4 | Intent di bawah lima menit | cron mengabaikan |
| P5 | Intent di atas lima menit | cron mencoba repair dan melaporkan result |
| P6 | Membership lock ditahan | 409 |
| P7 | Membership user tidak ada | 404 |
| P8 | Membership datastore gagal | 500/503, bukan 404 |
| P9 | Phone collision saat createUser dan email owner berpindah | rollback tidak menghapus owner baru |

## Gate promosi final

Working tree baru boleh dipromosikan bila semuanya terpenuhi:

1. Seluruh test matrix blocker A1–A11, C1–C6, V1–V6, dan P1–P9 lulus.
2. Tidak ada receipt replay yang menambah session.
3. Tidak ada 200 untuk purpose atau password yang tidak committed.
4. User verified selalu punya email/phone index permanent.
5. Challenge JSON dan guard dikonsumsi dalam commit yang sama.
6. Phone intent bertahan pada setiap failure sebelum settlement selesai.
7. `npm run qa` lulus lima kali setelah perubahan terakhir.
8. Dependency audit 0 vulnerability.
9. `git diff --check` lulus.
10. Production Vercel smoke 9/9 setelah deploy candidate.

Custom domain 9/9 tetap gate aktivasi domain, bukan gate commit source selama DNS belum diberikan.

## Non-goals batch ini

- Memindahkan seluruh user mutation biasa ke Lua.
- Membangun secondary admin-search index sebelum trigger 10.000 record atau p95 >500 ms.
- Visual regression, performance budget, dan synthetic production flow; ketiganya masuk gelombang setelah promosi.
- Mengaktifkan Resend atau DNS tanpa kredensial/otoritas ops.
- Mengubah kebijakan legacy admin yang sudah time-boxed.

## Handoff evidence yang harus dikembalikan builder

Builder perlu mengembalikan:

1. Ringkasan design final receipt dan alasan session replay tidak mungkin.
2. Daftar outcome Lua dan mapping HTTP masing-masing.
3. Output seluruh acceptance test matrix.
4. Jumlah E2E per profile dan skenario unik.
5. Lima output gate QA atau ringkasan exit code yang dapat diaudit.
6. Probe session count sebelum/sesudah receipt replay.
7. Probe TTL email/phone index setelah verify.
8. Probe purpose mismatch dan different-password replay.
9. `git diff --check` dan `npm audit` final.
10. Daftar residual risk yang sengaja tidak ditutup.
