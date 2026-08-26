# TAP by Haluan — QC/QA Depth Review, Putaran 17

**Working tree di atas commit `215a1bf` · Tanggal:** 17 Agustus 2026

**Skor kandidat: 8,7/10**

Audit independen atas enam gate remediasi putaran 16. Review mencakup script Lua yang dipakai untuk commit OTP, padanan perilakunya di mock datastore, route auth dan membership, settlement retry, kontrak konfirmasi paralel, acceptance test baru, satu quality gate penuh independen, lima quality gate milik builder, serta probe adversarial pada build production lokal.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Enam gate putaran 16 | **DITERIMA** | Ownership check terjadi sebelum tulisan pertama; cleanup failure terlihat; membership mapping jujur; takeover nyata; kontrak paralel konsisten; artefak build bersih. |
| Promosi working tree | **HOLD** | Contested email masih memiliki dead end setelah kode lama kedaluwarsa, dan critical Lua belum dieksekusi oleh test suite yang sama dengan production. |
| Aktivasi Resend | **HARD-BLOCKED** | Recovery contested identity harus ditutup sebelum jalur OTP dapat diaktifkan. |
| Trade-off phone conflict | **DITERIMA** | Menolak verifikasi lebih aman daripada menghapus nomor dari record secara diam-diam. |
| Paid acquisition | **NO-GO** | Gelombang B, domain, ops, dan bukti bisnis tetap terbuka. |

Production live tidak diuji ulang pada putaran ini. Keputusan di atas menilai kandidat working tree, bukan mengubah status deployment yang sudah tayang.

## Ringkasan

Perbaikan utama benar. Script sekarang memeriksa seluruh ownership index sebelum mengonsumsi guard atau menulis apa pun. Probe dengan email dan phone yang sengaja dimiliki `rival-user` menghasilkan 409, mempertahankan kedua owner, membiarkan guard hidup, dan tidak membuat receipt. Setelah claim dibebaskan, kode yang sama berhasil. Ini menutup regresi pemindahan identitas yang ditemukan pada putaran 16.

Receipt tetap berfungsi sebagai acknowledgment, bukan kredensial. Cleanup challenge yang gagal sekarang menghasilkan response 200 untuk commit yang sudah mendarat, menulis debt `challenge`, dan dapat diselesaikan cron. Real lock takeover juga benar-benar memindahkan token sebelum script commit, bukan sekadar melempar error transport.

Yang tersisa berada satu lapis setelah fail-closed. Claim registrasi dan challenge sama-sama hidup 30 menit, tetapi claim dibuat lebih dulu. Karena itu challenge dapat hidup sedikit lebih lama daripada claim. Ketika akun lain mengambil email pada celah tersebut, guard baru memang mencegah pencurian identitas—tetapi akun pertama kehilangan jalur untuk meminta kode baru. Setelah kode lama habis dan claim rival dibersihkan, lookup email kosong; endpoint request mengembalikan respons anti-enumeration biasa tanpa mengirim email.

Selain itu, test E2E tidak menjalankan Lua production. Mock mengenali tag `__commit_with_challenge__` lalu menjalankan implementasi JavaScript terpisah. Mutation check builder menghapus ownership loop dari Lua **dan** mock agar V4/V5 gagal. Itu membuktikan acceptance test berguna, tetapi juga membuktikan bahwa perubahan hanya pada Lua dapat lolos tanpa terdeteksi.

## Bukti QA

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa`, builder | **5/5 exit 0** |
| `npm run qa`, reviewer | **1/1 exit 0** |
| E2E | **100/100 per run** |
| Unit test | **15/15 per run** |
| Dependency audit | **0 vulnerability** |
| Build, TypeScript, lint | lulus |
| `git diff --check` | lulus |
| Skenario unik | 24 auth + 10 public + 7 accessibility + 1 legacy = **42** |
| Sebaran E2E | 41 mobile Chromium · 41 desktop Chromium · 17 mobile WebKit · 1 legacy |

## Probe independen

### Ownership index

```text
email conflict: 409
phone conflict setelah email dibebaskan: 409
email owner: rival-user
phone owner: rival-user
guard hidup: true
receipt dibuat: false
setelah kedua claim dibebaskan, kode sama: 200 · signedIn true
```

### Cleanup challenge

```text
reset committed: 200 · signedIn true
fault DEL terpanggil: 1
challenge JSON tertinggal: true
settlement queue: 1
steps: [challenge]
```

### Recovery setelah kode contested kedaluwarsa

```text
verify saat email dimiliki rival: 409
claim rival kemudian dibersihkan
kode lama setelah expiry: 400
email index: null
request kode baru: 200 dengan challenge id generik
email terkirim sebelum/sesudah request: 0 / 0
```

Response 200 terakhir memang benar untuk anti-enumeration, tetapi secara operasional akun lama tidak pulih. Tanpa email index, route tidak dapat menemukan user yang harus menerima challenge.

## Penilaian enam gate

| Gate | Penilaian |
|---|---|
| Ownership check sebelum write | **Diterima.** Lua dan mock memeriksa semua index sebelum guard dikonsumsi. |
| Kode tetap hidup pada conflict | **Diterima.** V4 memiliki kontrol positif dan probe independen berhasil. |
| Challenge cleanup observable | **Diterima.** Strict cleanup menghasilkan debt `challenge`; cron path diuji. |
| Membership 404/500/503 | **Diterima.** Missing record 404, injected datastore failure 500, env unavailable 503. |
| Real lock takeover | **Diterima.** `/__steal` mengubah token sebelum commit dan script mengembalikan lock loss. |
| Kontrak paralel dan artefak | **Diterima.** Tidak ada false 400, retry 409 eksplisit, satu session; `tsconfig.tsbuildinfo` di-ignore. |

## Temuan

### R17-01 · P2 — Contested email fail-closed, tetapi tidak recoverable setelah kode habis

Temporary email/phone claim dibuat dengan TTL 30 menit di `createUser`. Challenge juga hidup 30 menit, tetapi dibuat setelah claim. Runbook bahkan menyatakan bahwa claim dapat kedaluwarsa saat code masih valid. Guard baru menutup pemindahan identitas, tetapi tidak menutup lifecycle yang memicu conflict.

Untuk email conflict, setelah holder rival dihapus:

1. email index menjadi kosong;
2. challenge lama segera kedaluwarsa karena hanya hidup sedikit lebih lama daripada claim awal;
3. `findUserByEmail` tidak lagi menemukan akun pertama;
4. request verify baru mengembalikan respons anti-enumeration, tetapi tidak membuat atau mengirim challenge;
5. akun pertama hanya dapat dipulihkan lewat rebind manual atau registrasi ulang.

Runbook saat ini mengatakan cron menghapus stale holder “within the hour” dan kode lama kemudian bekerja. Cron sebenarnya terjadwal harian pukul `02:17 UTC`, sedangkan cleanup hanya mengambil akun yang sudah berumur satu jam. Waktu tunggunya dapat mendekati 25 jam—jauh melewati TTL code 30 menit.

**Perbaikan minimum.** Hilangkan race secara struktural: temporary claim harus hidup lebih lama daripada challenge terbaru beserta margin aman. Gunakan satu source of truth untuk TTL, misalnya challenge 30 menit dan claim 60 menit, atau renew claim secara ownership-safe ketika challenge dibuat. Setelah itu conflict tetap dipertahankan sebagai defense-in-depth untuk data legacy/corrupt.

Tambahkan recovery contract yang jujur:

- code tetap dapat dipakai hanya sampai expiry aslinya;
- support tidak boleh sekadar menghapus rival claim lalu menganggap akun pulih;
- bila akun lama perlu dipertahankan, claim harus di-rebind secara ownership-safe ke user tersebut sebelum challenge baru diterbitkan;
- conflict sebaiknya dicatat sebagai audit/queue yang memuat user ID, jenis claim, dan waktu—tanpa membocorkan owner ke caller.

### R17-02 · P2 QA — Atomic production contract masih diuji melalui mock yang terpisah

`tests/helpers/mock-redis.mjs` tidak mengeksekusi Lua dari `lib/atomic.ts`. Ia mengenali comment tag lalu menulis ulang semantiknya dalam JavaScript. Karena itu empat keadaan dapat berbeda tanpa test merah:

- ownership check ada di mock tetapi hilang dari Lua;
- urutan check/write berbeda;
- kode outcome berbeda;
- perubahan jumlah KEYS/ARGV hanya diperbaiki pada salah satu sisi.

Mutation check yang menghapus loop dari kedua file membuktikan test skenario, bukan kesetaraan implementasi. Menghapus loop hanya dari Lua akan tetap membuat E2E hijau.

**Perbaikan.** Tambahkan integration test terhadap Redis asli yang mengeksekusi script production. Minimal mencakup:

1. lock lost;
2. challenge spent;
3. email conflict;
4. phone conflict;
5. tidak ada record/guard/receipt/index write pada conflict;
6. claim menjadi permanent pada commit;
7. compare-and-delete dan lease renewal.

`redis-server` tersedia di environment lokal. Untuk CI, jalankan service Redis atau container kecil. Mock REST tetap berguna untuk E2E dan failure injection, tetapi bukan satu-satunya oracle untuk Lua.

### R17-03 · P3 — Runbook dan observability conflict belum lengkap

Tiga koreksi:

1. Tabel OTP menyebut “exactly three outcomes”, sementara API sekarang juga dapat menghasilkan precondition conflict 409. Nyatakan bahwa tiga status tersebut adalah outcome terminal **setelah** ownership precondition lulus.
2. Ganti “within the hour” dengan jadwal sebenarnya atau ubah frekuensi cron.
3. Tambahkan `challenge.claim_conflict` yang didedup untuk membantu support menemukan akun yang ditolak; saat ini satu-satunya sinyal adalah pengguna menghubungi tim.

## Skor

| Area | Bobot | Skor | Kontribusi | Penentu |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 9,0 | 1,44 | Session replay dan identity overwrite tertutup; conflict recovery masih manual. |
| Functional correctness | 14% | 8,7 | 1,22 | Enam gate benar; request kode baru tidak memulihkan orphaned pending account. |
| QA depth | 12% | 9,4 | 1,13 | 6×100 stabil dan mutation checks kuat; Lua production belum dieksekusi langsung. |
| Reliability | 10% | 8,6 | 0,86 | Settlement dan takeover kuat; recovery claim bergantung support. |
| Data integrity | 10% | 8,9 | 0,89 | Ownership sekarang fail-closed dan atomic. |
| UX | 10% | 8,3 | 0,83 | Conflict jelas, tetapi recovery setelah expiry belum benar. |
| Performance | 8% | 8,9 | 0,71 | Tidak ada regresi terukur pada gate ini; budget historis tetap belum ada. |
| Accessibility | 6% | 8,8 | 0,53 | Axe Chromium dan WebKit tetap lulus. |
| SEO | 5% | 8,6 | 0,43 | Tidak berubah pada putaran ini. |
| Visual consistency | 5% | 7,9 | 0,40 | Visual regression masih terbuka. |
| Trust & proof | 4% | 6,6 | 0,26 | Bukti settlement bisnis belum tersedia. |
| **Total** | **100%** |  | **8,70 → 8,7/10** |  |

## Improvement plan

### Gelombang A17 · sebelum promosi · ±2–4 jam

1. Satukan constant TTL claim/challenge dan pastikan claim selalu melampaui challenge dengan margin aman.
2. Tambahkan test accelerated-clock: claim tidak boleh hilang selama challenge masih valid.
3. Tentukan recovery email conflict setelah expiry: ownership-safe rebind + issue challenge, atau hapus akun lama dan arahkan registrasi ulang secara eksplisit.
4. Catat claim conflict untuk support dan koreksi runbook cron/TTL/outcome.
5. Jalankan contract test Lua terhadap Redis asli; jangan menduplikasi behavior hanya di mock.
6. Ulangi lima quality gate setelah perubahan terakhir dan jalankan probe contested-email recovery.

### Gelombang B · setelah promosi

7. Auth smoke WebKit.
8. Visual regression enam permukaan utama.
9. Performance budget dan synthetic production flow.
10. Aktivasi DNS custom domain dan smoke kedua host.
11. Aktifkan Resend hanya setelah A17 lulus; `unprovenAdmins` harus nol maksimal 24 jam setelah aktivasi.

### Sebelum paid acquisition

12. Jalankan satu campaign closed beta sampai settlement dengan bukti yang dapat diaudit.
13. Tutup gap aset, campaign, masa berlaku, dan intake sample yang masih tercatat.

Trigger secondary admin-search index tetap **10.000 record atau p95 endpoint admin >500 ms**, mana lebih dulu.

## Gate pengangkatan HOLD

HOLD boleh ditinjau ulang bila:

1. claim tidak dapat kedaluwarsa sebelum challenge;
2. contested email punya recovery yang tetap bekerja setelah code expiry;
3. Lua production lulus contract test Redis asli;
4. runbook tidak lagi menjanjikan recovery satu jam atau reuse code di luar TTL;
5. `npm run qa` kembali lulus lima kali, 0 vulnerability;
6. `git diff --check` lulus dan tidak ada artefak build untracked.

Audit ini tidak mengubah source produk. Hanya laporan review yang ditambahkan.
