# TAP by Haluan — QC/QA Depth Review, Putaran 18

**Working tree di atas commit `215a1bf` · Tanggal:** 17 Agustus 2026

**Skor kandidat: 8,1/10**

Audit independen atas Gelombang A17. Review mencakup lifecycle claim dan challenge, recovery akun pending, fixture E2E, Lua production terhadap Redis asli, isolasi contract test, portabilitas GitHub Actions, runbook, satu quality gate penuh, serta tiga probe adversarial pada build production lokal.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Shared TTL dan ownership-safe renewal | **DITERIMA** | Claim baru hidup 60 menit, challenge 30 menit, dan email maupun phone diperpanjang dengan compare-and-expire. |
| Recovery lewat `users:pending` | **DITOLAK** | Test memakai owner index tanpa record. Dengan dua akun nyata, request memilih akun rival dan dapat memverifikasi akun yang password-nya masih diketahui rival. |
| Contract test Redis asli | **DITERIMA BERSYARAT** | Script production benar-benar dieksekusi dan delapan kontraknya lulus. Harness belum aman dari Redis yang sudah memakai port tetap dan belum dapat berjalan di CI saat ini. |
| Promosi working tree | **HOLD** | Ada P1 account pre-hijacking pada flow verifikasi credentials. |
| Aktivasi Resend | **HARD-BLOCKED** | Menyalakan provider membuat P1 dapat dicapai. Perbaikan auth harus dipromosikan lebih dahulu. |
| Paid acquisition | **NO-GO** | P1, Gelombang B, domain, ops, visual/performance regression, dan bukti bisnis masih terbuka. |

Production live tidak diuji ulang pada putaran ini. Keputusan di atas menilai kandidat working tree dan tidak mengubah status deployment yang sudah tayang.

## Ringkasan board

Bagian atomik A17 memang naik kelas. TTL tidak lagi tersebar, claim email dan phone diperpanjang sebelum kode baru diterbitkan, dan Lua production akhirnya diuji oleh Redis asli melalui transport `redis()` aplikasi. Perubahan itu valid.

Masalahnya berada satu tingkat di atas primitive tersebut: **endpoint memilih akun berdasarkan siapa yang memegang index email saat request datang**. Recovery hanya membaca `users:pending` bila index email kosong. Bila akun rival yang nyata sudah mengambil alamat tersebut, `findUserByEmail` mengembalikan akun rival dan fallback recovery tidak pernah berjalan.

Fixture A17 tidak memodelkan keadaan itu. Test menulis:

```text
email:{address} = rival-user
user:rival-user = tidak ada
```

Karena record rival tidak ada, `findUserByEmail` menghasilkan `null`, lalu route jatuh ke pending scan dan menemukan akun pertama. Itu menguji dangling index, bukan email yang benar-benar diambil akun lain.

Probe dengan dua akun pending nyata memberi hasil berbeda:

```text
akun A mendaftar
claim A dihapus/kedaluwarsa
akun B mendaftar dengan email sama dan password pilihannya
request verify untuk email tersebut → challenge milik B
kode dari inbox → memverifikasi dan membuat session B
login memakai password pilihan B → 200
```

Ini adalah **account pre-hijacking**. Pemilik inbox melakukan tindakan yang tampak seperti memulihkan/verifikasi akunnya, tetapi sebenarnya mengaktifkan akun B; password yang dipilih B tetap sah setelah verifikasi.

Gate hijau tidak mengurangi temuan itu. Gate membuktikan 106 eksekusi stabil terhadap state yang salah. Justru karena test recovery merupakan acceptance test utama A17, ketidaksetaraan fixture dengan state production menjadi temuan QA yang load-bearing.

## Bukti QA reviewer

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa`, reviewer | **1/1 exit 0** |
| E2E | **106/106** |
| Unit dan contract | **24/24**, bukan 23/23 |
| Contract Redis asli | **8/8** |
| Dependency audit | **0 vulnerability** |
| Lint, TypeScript, build | lulus |
| `git diff --check` | lulus |
| Skenario unik | 27 auth + 10 public + 7 accessibility + 1 legacy = **45** |
| Sebaran E2E | 44 mobile Chromium · 44 desktop Chromium · 17 mobile WebKit · 1 legacy |
| Diff tracked saat audit | 40 file · +2.963/−520 |

Laporan terakhir builder masih menyebut lima gate berjalan, sehingga audit ini hanya menghitung gate yang hasil akhirnya dapat saya lihat sendiri. Angka unit aktual adalah 24: delapan contract test ditambah enam belas test lain.

## Probe independen

### 1. Dua akun nyata dengan email yang sama

```text
register A: 202
original user: 145c…d13e
register B setelah claim A dilepas: 202
rival user: 88d7…a2b1
verify/request: 200
challenge user: 88d7…a2b1
routedToRival: true
originalRecovered: false
```

Setelah kode terbaru dimasukkan:

```text
verification status: 200
verified account: Rival B
signedIn: true
session issued: true
login dengan password pilihan B: 200
attacker password still valid: true
```

### 2. Batas recovery 500 akun

Saya membuat 501 record pending, menempatkan target sebagai anggota paling tua, mengosongkan email index-nya, lalu meminta kode.

```text
pending count: 501
request status: 200
claim setelah request: null
email terkirim: 0
recovered: false
```

`ZREVRANGE 0..499` mengambil 500 akun terbaru dan melewatkan akun tertua. Ini terbalik dari lifecycle-nya: akun tertua justru paling mungkin sudah kehilangan claim.

### 3. Contract dan full gate

```text
real Redis contract: 8/8
seluruh unit: 24/24
full E2E: 106/106
lint/build: pass
npm audit: 0 vulnerability
```

## Penilaian A17

| Item | Penilaian | Catatan |
|---|---|---|
| Satu source of truth TTL | **Diterima** | `CHALLENGE_TTL_SECONDS=1.800`, margin 1.800, claim 3.600 detik. |
| Renewal email claim | **Diterima** | `SET NX` lalu compare-and-`PEXPIRE`, tidak memindahkan owner lain. |
| Renewal phone claim | **Diterima di kode** | Implementasi benar, tetapi acceptance test hanya mengassert TTL email. |
| Recovery ketika index kosong | **Diterima terbatas** | Bekerja bila target berada di 500 anggota terbaru dan tidak ada owner nyata. |
| Recovery ketika index dimiliki akun lain | **Ditolak** | Akun rival dipilih sebelum pending recovery; tidak ada conflict event untuk akun lama. |
| Audit `pending.scan_truncated` | **Diterima sebagai sinyal** | Sinyal tidak memulihkan akun dan belum punya respons operasional di runbook. |
| Redis contract fidelity | **Diterima** | Lua, KEYS/ARGV, transport, dan outcome mapping ikut dijalankan. |
| Contract harness isolation | **Ditolak** | Fixed port dapat menyentuh Redis lain dan memanggil `FLUSHALL`. |
| Runbook | **Sebagian** | Jadwal cron dan conflict dijelaskan, tetapi TTL 30 menit lama masih tertulis dan bertentangan dengan paragraf berikutnya. |

## Temuan

### R18-01 · P1 — Email-only verification dapat mengaktifkan akun yang password-nya dipilih pihak lain

`verify/request` lebih dulu memanggil `findUserByEmail(email)`. Pending scan hanya digunakan ketika hasilnya kosong. Itu membuat current index owner menjadi identitas target tanpa bukti bahwa request berasal dari flow registrasi owner tersebut.

Urutannya:

1. A membuat akun credentials dengan email korban.
2. Claim sementara A hilang atau record legacy berada pada state serupa.
3. B membuat akun baru dengan email sama, password B, dan nomor B.
4. Pemilik inbox meminta kode verifikasi.
5. Route menemukan B dari email index dan menerbitkan challenge untuk B.
6. Pemilik inbox memasukkan kode dan menerima session B.
7. Password B tidak dirotasi; B tetap dapat login ke akun yang sekarang berstatus verified.

Atomic ownership check saat commit tidak membantu: B memang current owner index, sehingga seluruh precondition Lua lulus. Ini bukan pencurian index; ini pemilihan account principal yang salah sebelum script dipanggil.

Efek samping operasional juga berbeda dari klaim A17:

- bila rival verified, route mengembalikan response anti-enumeration tanpa audit conflict akun lama;
- bila rival pending, route mengirim atau memakai ulang challenge rival;
- `challenge.claim_conflict` tidak tercatat untuk akun lama karena `assertPendingClaims` tidak pernah menerima akun lama;
- pemilik inbox dapat mengaktifkan akun dengan data profil dan password yang bukan miliknya.

**Perbaikan yang direkomendasikan.** Pisahkan dua jenis bukti:

1. **Kelanjutan registrasi.** Kode verify hanya boleh diterbitkan ulang untuk `userId` yang dibuktikan oleh continuation token berentropi tinggi atau oleh password yang baru saja diverifikasi. Jangan menentukan user hanya dari email publik.
2. **Pemulihan tanpa continuation token.** Gunakan flow reset: kode email harus disertai password baru; commit memverifikasi email, mengganti password, memasang `sessionsInvalidBefore`, dan mencabut akses password/session lama secara atomik. Email ownership tidak boleh mengaktifkan akun sambil mempertahankan password pihak lain.
3. **Lifecycle uniqueness.** Pending email claim tidak boleh hilang sebelum pending record dihapus. Pilihan paling sederhana adalah claim tanpa TTL yang dilepas oleh cleanup idempoten; bila TTL tetap dipakai, cleanup harus lebih cepat dan claim harus hidup melampaui batas terburuk cleanup, bukan hanya challenge.
4. **Hapus email-only verify reissue** sampai continuation proof tersedia. Endpoint publik tetap boleh meminta reset karena reset mengganti credential yang lama.

Ini perubahan model auth, bukan satu kondisi `if`. Estimasi wajar: **1–1½ hari** termasuk test dan migrasi state pending.

### R18-02 · P2 QA — Acceptance test recovery memakai dangling owner, bukan rival account

Di dua test A17, `email:{address}` diisi `rival-user`, tetapi `user:rival-user` tidak dibuat. `findUserByEmail` membaca index lalu gagal membaca record. Akibatnya route menjalankan fallback yang tidak akan dijalankan ketika rival merupakan akun nyata.

**Perbaikan.** Fixture wajib membuat record B lengkap dan memasukkannya ke `users`/`users:pending`. Assertion tidak cukup pada status/outbox; baca challenge JSON dan pastikan `userId` yang dituju benar. Test harus gagal bila challenge diarahkan ke B.

Acceptance minimum:

- A pending + B pending nyata, email index B;
- A pending + B verified nyata, email index B;
- challenge tidak pernah diarahkan ke principal yang dipilih hanya dari email publik;
- password B dan session B tidak tetap valid setelah recovery oleh pemilik inbox;
- conflict event menyebut akun yang benar tanpa membocorkannya ke caller;
- kontrol positif recovery A setelah state aman dipulihkan.

### R18-03 · P2 — Recovery scan gagal di 501 record dan memberi amplification pada endpoint publik

`findPendingUserByEmail` menjalankan `ZREVRANGE` lalu `MGET` sampai 500 record untuk setiap email tanpa index. Dua konsekuensi:

1. target paling tua dilewatkan ketika ada 500 record yang lebih baru;
2. satu request publik untuk alamat acak dapat menarik sampai 500 record user dari datastore.

Audit `pending.scan_truncated` membuat kegagalan terlihat, tetapi tidak membuat recovery berhasil. Batas ini juga dapat dicapai lewat abuse terdistribusi, jadi trigger 10.000 record untuk admin search tidak relevan pada endpoint publik ini.

**Perbaikan.** Hilangkan scan dari request path. Gunakan lookup O(1) yang lifecycle-nya sama dengan pending record, misalnya `pending-email:{hash}` yang hanya dilepas bersama penghapusan account. Namun index baru harus mengikuti desain R18-01: ia tidak boleh membuat email-only verification mempertahankan password pihak lain.

### R18-04 · P2 QA/Safety — Contract test dapat menghapus data Redis yang bukan milik test

Contract test memakai port tetap 6479, menyalakan `redis-server`, lalu hanya memeriksa apakah `PING` menjawab. Jika port itu sudah ditempati Redis lain:

1. child yang baru gagal bind;
2. `PING` ke server lama berhasil;
3. `arrange()` menjalankan `FLUSHALL` pada server lama.

Port yang jarang dipakai memperkecil probabilitas, tetapi tidak mengubah dampaknya. Test suite tidak boleh berpotensi menghapus datastore developer.

**Perbaikan.** Jalankan Redis dengan Unix socket unik di direktori `mkdtemp`, `--port 0`, persistence mati, dan tunggu child yang sama siap. Bridge boleh memakai port dinamis dari `listen(0)`. Teardown gunakan SIGTERM, tunggu child exit, lalu hapus direktori temp. Setelah itu `FLUSHDB` aman karena instance tersebut pasti milik test.

Tambahkan safety test: Redis sentinel di port 6479 harus tetap utuh setelah `npm test`, dan dua proses `npm test` paralel harus sama-sama lulus.

### R18-05 · P2 QA — GitHub quality gate belum memasang dependency Redis

`tests/atomic-contract.test.mjs` sengaja gagal bila `redis-server` tidak tersedia. Itu benar. Namun workflow menjalankan `npm test` tanpa memasang Redis atau `redis-cli`. Manifest resmi image GitHub-hosted Ubuntu 24.04 saat audit tidak mencantumkan Redis pada database maupun installed apt packages: [GitHub runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).

Artinya contract test lokal naik kualitas, tetapi quality gate GitHub kandidat ini akan berhenti di unit phase sebelum menjalankan build/E2E.

**Perbaikan.** Tambahkan langkah install Redis server dan tools dengan versi yang dicatat sebelum `npm test`, atau pakai container/toolchain yang dipin. Bukti selesai harus berupa run GitHub Actions pada commit kandidat, bukan hanya gate lokal.

### R18-06 · P3 — Dokumentasi dan coverage TTL belum konsisten

Tiga koreksi kecil tetapi penting:

- runbook masih berkata claim registrasi hidup 30 menit dan dapat kedaluwarsa saat code masih valid; implementasi sekarang 60 menit dan paragraf berikutnya berkata sebaliknya;
- `pending.scan_truncated` belum memiliki langkah respons—operator hanya mendapat event tanpa prosedur memulihkan target;
- E2E TTL hanya mengassert email claim. Menghapus renewal phone saja tidak akan memerahkan test tersebut.

Tambahkan assertion TTL phone sebelum dan sesudah reissue, serta mutation check yang hanya menghapus cabang phone. Koreksi angka unit dari 23 menjadi 24 pada laporan gate berikutnya.

## Skor

| Area | Bobot | Skor | Kontribusi | Penentu |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 7,2 | 1,15 | Account pre-hijacking dapat dicapai begitu email aktif. |
| Functional correctness | 14% | 8,1 | 1,13 | TTL/atomic contract benar; recovery memilih principal yang salah. |
| QA depth | 12% | 8,9 | 1,07 | 106 E2E dan Redis asli kuat; fixture rival, CI, dan isolasi harness masih salah. |
| Reliability | 10% | 8,3 | 0,83 | Renewal stabil; recovery memiliki dead end dan routing ambigu. |
| Data integrity | 10% | 8,1 | 0,81 | Index tidak dicuri, tetapi identitas akun yang diaktifkan dapat salah. |
| UX | 10% | 7,8 | 0,78 | Pengguna dapat merasa memulihkan A saat sebenarnya mengaktifkan B. |
| Performance | 8% | 8,4 | 0,67 | Public recovery dapat melakukan MGET 500 record. Budget tetap terbuka. |
| Accessibility | 6% | 8,8 | 0,53 | Axe Chromium/WebKit lulus. |
| SEO | 5% | 8,6 | 0,43 | Tidak berubah pada putaran ini. |
| Visual consistency | 5% | 7,9 | 0,40 | Visual regression masih terbuka. |
| Trust & proof | 4% | 6,6 | 0,26 | Bukti settlement bisnis belum tersedia. |
| **Total** | **100%** |  | **8,06 → 8,1/10** |  |

## Improvement plan untuk builder

### Gelombang A18.1 · P1 auth model · 1–1½ hari

1. Bekukan `purpose=verify` berbasis email saja; Resend tetap hard-blocked.
2. Tambahkan continuation proof yang terikat pada `userId` untuk registrasi dan reissue verify.
3. Pindahkan recovery tanpa proof ke reset-style activation: code + password baru + session cut-off dalam atomic commit.
4. Buat pending ownership hidup sampai pending record benar-benar dihapus; cleanup dan rollback harus compare-and-delete.
5. Tentukan migrasi untuk duplicate pending state yang sudah mungkin ada: jangan memilih pemenang hanya dari current email index.
6. Audit `verification.challenge_misdirected`/conflict dengan kedua user ID hanya di admin trail; caller tetap anti-enumeration.

### Gelombang A18.2 · acceptance matrix · ½ hari

7. Dua pending account nyata dengan email sama; challenge tidak boleh menuju B dari request A.
8. Rival verified nyata; tidak ada challenge, session, atau conflict yang salah sasaran.
9. Recovery tanpa continuation mengganti password dan mematikan seluruh credential/session lama.
10. Registrasi awal dengan continuation tetap satu commit dan satu session.
11. Dua request recovery paralel tetap satu challenge dan satu hasil autentikasi.
12. Receipt tetap terikat purpose/payload baru dan replay tidak mencetak session.
13. TTL email **dan phone** diuji setelah reissue; mutation hanya pada phone harus memerahkan test.
14. State duplicate/legacy punya migrasi dan test idempoten.

### Gelombang A18.3 · datastore dan CI · 2–4 jam

15. Ganti scan 500 record dengan lookup O(1) yang mengikuti lifecycle pending record.
16. Isolasi Redis contract test lewat Unix socket/temp directory unik; hilangkan fixed port dan risiko `FLUSHALL` eksternal.
17. Pasang Redis server/tools secara eksplisit di workflow CI dan pin basis versinya.
18. Jalankan dua `npm test` paralel, sentinel Redis safety test, lalu GitHub Quality Gate pada branch kandidat.

### Gelombang A18.4 · docs dan observability · 1–2 jam

19. Koreksi runbook claim 60 menit dan hapus kalimat bahwa claim dapat kedaluwarsa di bawah code hidup.
20. Dokumentasikan continuation, reset-style activation, duplicate pending remediation, dan `pending.scan_truncated` sampai scan dihapus.
21. Tampilkan counter principal-conflict/recovery failure di heartbeat atau admin audit; event saja tanpa agregat mudah terlewat.
22. Catat angka gate aktual: 24 unit/contract dan 106 E2E pada kandidat A17.

## Gate pengangkatan HOLD

HOLD hanya boleh ditinjau ulang bila seluruh syarat ini terpenuhi:

1. email-only request tidak dapat memilih pending principal tanpa continuation proof;
2. recovery oleh pemilik inbox tidak pernah mempertahankan password/session pihak lain;
3. dua akun rival nyata masuk acceptance test—bukan hanya dangling index;
4. tidak ada scan 500 user pada public request path;
5. contract Redis terisolasi dan tidak dapat `FLUSHALL` instance eksternal;
6. GitHub Actions memasang dependency dan Quality Gate remote hijau;
7. lima `npm run qa` berurutan hijau setelah perubahan terakhir, masing-masing 0 vulnerability;
8. probe independen membuktikan challenge diarahkan ke user yang benar, password lama mati, dan jumlah session tepat;
9. runbook cocok dengan TTL dan flow yang benar-benar berjalan;
10. `git diff --check` bersih dan tidak ada artefak build untracked.

Setelah A18 lulus, urutannya tetap: promosi source → smoke preview → aktivasi Resend → smoke verify/reset production → tenggat admin legacy 24 jam. DNS, visual regression, performance budget, synthetic production flow, dan bukti closed-beta settlement tetap berada setelah blocker auth.

Audit ini tidak mengubah source produk. Hanya laporan review yang ditambahkan.
