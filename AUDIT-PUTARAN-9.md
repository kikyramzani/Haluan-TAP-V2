# TAP by Haluan — QC/QA Depth Audit, Board Review, dan Improvement Plan

- **Putaran:** 9
- **Tanggal:** 17 Agustus 2026
- **Basis kode:** commit `215a1bf` + working tree 35 file, `+778/−177`
- **Production yang diuji:** `https://haluan-tap.vercel.app`
- **Skor tertimbang:** **8,6/10**

## Keputusan board

| Lingkup keputusan | Hasil | Alasan utama |
|---|---|---|
| Closed beta pada production saat ini | **GO** | Smoke production 9/9 dan tidak ada insiden aktif yang ditemukan. Production masih baseline lama, bukan batch ini. |
| Promosi seluruh working tree | **HOLD** | Race dua update profil masih meninggalkan claim nomor WhatsApp yatim. Ini P2 data integrity dengan bukti reproduksi langsung. |
| Pengecualian admin legacy | **DISETUJUI SEMENTARA** | Menjaga akses operator lebih aman daripada menciptakan lockout saat provider email belum aktif, tetapi harus punya pemilik, tenggat, dan status UI yang jujur. |
| Paid acquisition | **NO-GO** | Provider email, custom domain, synthetic production flow, performance budget, visual regression, retention, kualitas data, dan bukti bisnis belum lengkap. |

## Ringkasan eksekutif

Putaran ini memperbaiki risiko tertinggi audit sebelumnya. Akun credentials di allowlist tidak lagi otomatis menjadi admin. Pemberian role sekarang memerlukan bukti `code` atau `google`, penolakan meninggalkan audit, dan verifikasi kode langsung mempromosikan kandidat yang sah. Probe terarah membuktikan urutannya: setelah registrasi, akun masih `creator/pending`; setelah kode benar, record menjadi `admin/verified` dengan `verificationSource=code` dan audit `admin.granted`.

Desain reset email juga menutup race yang ditemukan putaran 8. Dua permintaan bersamaan menerima ID challenge yang sama, dan kegagalan provider diikuti retry langsung yang berhasil. Masalah challenge palsu dan lockout korban tidak dapat direproduksi lagi.

WebKit adalah peningkatan QA yang material. Total 72 bukan sekadar penggandaan angka: ada tiga skenario auth baru yang berjalan di dua profil Chromium, ditambah 17 skenario public/accessibility pada engine WebKit. Engine baru itu memang menemukan dua regresi browser/layout yang nyata. Lima run penuh juga stabil tanpa retry lokal.

Satu closure belum dapat diterima penuh. Dua `PATCH /api/profile` paralel untuk user yang sama sama-sama mengembalikan 200. Record akhirnya menyimpan satu nomor, tetapi indeks menyimpan kedua nomor baru sebagai milik user tersebut. Nomor yang kalah tidak lagi tercantum pada profil, tetapi tetap terkunci bagi akun lain. R8-02 karena itu masih parsial.

Tidak ada P1 baru. Ada satu P2 dan beberapa P3 yang tidak menghalangi closed beta, tetapi P2 harus ditutup sebelum batch dipromosikan.

## Bukti yang diverifikasi ulang

### Gate lokal

| Pemeriksaan | Hasil audit |
|---|---:|
| `npm run qa` berurutan | **5/5 hijau** |
| Unit/security test | **14/14 per run** |
| E2E execution | **72/72 per run** |
| Skenario unik | **28** |
| Eksekusi Chromium | **55** |
| Eksekusi WebKit | **17** |
| Dependency audit | **0 vulnerability** |
| Build Next.js 16.3.1 | **5/5 lulus** |
| `git diff --check` | **Lulus** |

Komposisi kenaikan 49→72:

- **6 eksekusi** berasal dari tiga skenario baru yang berjalan pada mobile dan desktop Chromium.
- **17 eksekusi** berasal dari engine WebKit untuk sepuluh skenario public dan tujuh skenario accessibility.
- Totalnya tepat **23 eksekusi tambahan**. Jadi klaim bahwa kenaikan ini membawa engine kedua benar.

### Visual dan responsive

Probe memakai profil perangkat yang sama dengan konfigurasi Playwright:

| Perangkat | Viewport | Posisi atas kartu pertama | Horizontal overflow |
|---|---:|---:|---:|
| Pixel 7 · Chromium | 412×839 | 652 px | Tidak ada |
| iPhone 14 · WebKit | 390×664 | 470 px | Tidak ada |

Target discovery dalam layar pertama sekarang terpenuhi pada kedua perangkat. Pada iPhone pendek, body hero disembunyikan dan CTA disusun dua kolom. Kompromi ini dapat diterima untuk closed beta, tetapi visual regression masih dibutuhkan agar pemadatan layar pendek tidak bergeser tanpa diketahui.

### Production

| Pemeriksaan | Hasil |
|---|---:|
| Smoke production | **9/9 lulus** |
| Homepage | **200** |
| `/api/health` | **200 · ready** |
| Region fungsi | **sin1** |
| CSP pada HTTPS | Hadir, termasuk `upgrade-insecure-requests` |
| Snapshot TTFB homepage | 346 ms |
| Snapshot TTFB health | 163 ms |
| `tap.haluandigital.agency` | **ENOTFOUND** |

TTFB di atas adalah satu snapshot, bukan benchmark. Production belum memuat working tree ini, sehingga smoke 9/9 tidak membuktikan closure admin, nomor WhatsApp, reset, atau WebKit sudah live.

### Data katalog

| Area | Kondisi |
|---|---:|
| TikTok terbit | 310 campaign |
| Shopee terbit | 383 campaign |
| Sel rate TikTok ditahan | 50 |
| Brand TikTok perlu cleanup | 35 |
| Campaign TikTok tidak terbit | 22 |

## Review tiga closure

| Temuan putaran 8 | Status putaran 9 | Kesimpulan |
|---|---|---|
| R8-01 · Pemberian admin tanpa bukti email | **Tertutup untuk pemberian baru** | Registrasi credentials tetap creator; `code/google` menjadi syarat grant; penolakan dan grant tercatat. Admin legacy menjadi pengecualian risiko sementara. |
| R8-02 · Indeks WhatsApp | **Parsial** | Clear-number dan rollback serial membaik, tetapi update paralel meninggalkan claim nomor yang kalah. |
| R8-03 · Race cooldown reset | **Tertutup dengan P3 follow-up** | Satu pointer `SET NX` menghilangkan challenge acak; provider failure dapat langsung di-retry. Cleanup pointer masih perlu compare-and-delete. |

## Temuan putaran 9

### R9-01 · P2 · Update profil paralel membuat claim WhatsApp yatim

**Bukti.** Satu user berawal pada nomor `6281200000001`. Dua request paralel mengubahnya ke `6281200000002` dan `6281200000003`.

Hasil probe:

```text
PATCH status        200, 200
record user         6281200000003
claim nomor lama    null
claim nomor ...002  user yang sama
claim nomor ...003  user yang sama
```

**Akar masalah.** Kedua request membaca record lama yang sama, mengklaim nomor masing-masing, menulis record, lalu hanya melepaskan nomor lama. Request yang kalah tidak pernah mengetahui bahwa claim barunya sudah tidak lagi cocok dengan record final. `releasePhoneClaim` juga memakai rangkaian `GET` lalu `DEL`, bukan compare-and-delete atomik.

**Dampak.** Nomor yang tidak tersimpan pada profil tetap tidak dapat dipakai akun lain. Indeks dan source of truth berbeda, sehingga support harus memperbaikinya secara manual.

**Perbaikan.** Satukan validasi record lama, klaim nomor baru, write record, dan pelepasan claim lama dalam satu operasi atomik—misalnya Lua/EVAL atau optimistic compare-and-set dengan revision. Tambahkan dua test:

1. dua perubahan nomor paralel harus meninggalkan tepat satu claim yang cocok dengan record final;
2. kegagalan write setelah claim tidak boleh meninggalkan claim baru, termasuk ketika datastore gagal pada fase cleanup.

### R9-02 · P3 · Pengecualian admin legacy benar secara operasi, tetapi status UI kontradiktif

**Keputusan audit.** Pengecualian ini **disetujui sementara**. Menurunkan seluruh admin legacy saat Resend belum aktif dapat menghilangkan jalur pemulihan production. Tidak memberi grant baru tanpa bukti, sambil mempertahankan operator yang sudah terpasang, adalah trade-off yang masuk akal untuk closed beta.

**Bukti UI.** Akun `grandfathered` ber-role admin tetap mendapat API admin 200 sesuai kebijakan. Workspace menampilkan dua pesan sekaligus:

- `Administrator terverifikasi` pada profil;
- `Admin tanpa bukti kepemilikan email` pada warning.

Keduanya tidak dapat benar bersamaan. Label profil terlalu kuat untuk admin yang sengaja dipertahankan tanpa proof.

**Syarat persetujuan.**

- Catat daftar admin legacy, pemilik risiko, dan tanggal persetujuan sebelum deploy.
- Ubah label profil menjadi `Administrator` atau turunkan status dari data proof aktual.
- Setelah Resend aktif, selesaikan reset setiap admin legacy paling lambat 24 jam.
- `unprovenAdmins` harus nol sebelum paid acquisition.
- Bila provider belum aktif, admin baru hanya boleh masuk lewat Google yang terverifikasi.

### R9-03 · P3 · WebKit belum menguji auth dan session

WebKit menjalankan 17 dari 28 skenario unik, seluruhnya pada `public.spec.ts` dan `accessibility.spec.ts`. Sebelas skenario auth/operasional tetap hanya berjalan di Chromium.

Datastore lifecycle memang tidak berubah antarengine, tetapi auth juga bergantung pada cookie, redirect, form submission, dan navigasi browser. Area itu relevan pada Safari/iPhone.

**Perbaikan minimum.** Tambahkan satu WebKit auth smoke yang membuktikan login atau registrasi-verifikasi, session cookie, `/api/auth/me`, dashboard gate, dan logout. Siklus admin penuh boleh tetap di Chromium.

### R9-04 · P3 · `admin.grant_blocked` dapat memenuhi audit log

Setiap request admin dari kandidat allowlisted tanpa proof menulis event baru. Probe lima request yang semuanya mendapat 403 menambah tepat lima audit event. Tidak ada deduplikasi atau cooldown.

Ini tidak membuka akses, tetapi dapat menggeser bukti operasi penting dari 100 aktivitas terbaru dan memperbesar storage tanpa batas.

**Perbaikan.** Catat hanya saat status keputusan berubah, atau gunakan key deduplikasi per user/alasan dengan TTL. Pertahankan counter terpisah jika frekuensi percobaan tetap perlu diamati.

### R9-05 · P3 · Challenge lama dapat menghapus pointer challenge yang lebih baru

Challenge berlaku 30 menit, sedangkan pointer resend berlaku 5 menit. Karena challenge lama sengaja tetap sah, kondisi dua challenge hidup adalah bagian dari desain. Namun `consumeEmailChallenge` menghapus active pointer berdasarkan email tanpa memeriksa apakah nilainya masih sama dengan ID yang sedang dikonsumsi.

Probe menaruh `newer-challenge-id` sebagai pointer, lalu mengonsumsi challenge lama yang valid. Reset berhasil, tetapi pointer yang lebih baru berubah menjadi `null`.

Ini tidak menghidupkan kembali lockout korban, tetapi melemahkan cooldown dan membuat lifecycle challenge tidak konsisten.

**Perbaikan.** Gunakan compare-and-delete untuk pointer: hapus hanya bila value masih sama dengan challenge yang dikonsumsi. Terapkan pola yang sama pada cleanup pointer dan claim nomor.

## Scoring board

| Area | Bobot | Skor | Kontribusi | Catatan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 8,4 | 1,34 | Grant baru sudah proof-gated; admin legacy masih risk exception. |
| Functional correctness | 14% | 9,0 | 1,26 | Alur utama kuat; satu race profil tetap terbuka. |
| QA depth | 12% | 9,6 | 1,15 | 5×72 stabil dan WebKit nyata; auth WebKit serta tiga gate R7-10 masih kurang. |
| Reliability | 10% | 8,4 | 0,84 | Reset recovery dan cron membaik; external observability belum lengkap. |
| Data integrity | 10% | 7,8 | 0,78 | Claim nomor paralel dan cleanup data masih menahan skor. |
| UX | 10% | 8,8 | 0,88 | Discovery iPhone membaik; status admin legacy kontradiktif. |
| Performance | 8% | 8,8 | 0,70 | Snapshot baik; belum ada budget atau distribusi p95. |
| Accessibility | 6% | 8,8 | 0,53 | Axe pada dua engine; belum ada coverage screen-reader/manual. |
| SEO | 5% | 9,0 | 0,45 | Baseline production kuat; custom domain belum hidup. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix terbukti; visual regression belum ada. |
| Trust & proof | 4% | 6,5 | 0,26 | Provider, retention, settlement, dan bukti bisnis masih tertunda. |
| **Total** | **100%** |  | **8,59 → 8,6/10** |  |

Naik dari 8,1 menjadi 8,6 karena P1 grant ditutup, reset race ditutup, dan WebKit memberi bukti lintas-engine. Skor belum melewati 9 karena P2 data integrity masih dapat direproduksi dan beberapa gate production tetap berbasis rencana, bukan bukti live.

## Improvement plan

### Gelombang A · sebelum promosi working tree

1. **Atomikkan update nomor WhatsApp.** Tutup race dua PATCH dan kegagalan cleanup, lalu tambahkan E2E adversarial.
2. **Jujurkan status admin legacy.** Hilangkan label `terverifikasi` ketika proof tidak ada dan simpan risk acceptance yang bernama.
3. **Gunakan compare-and-delete.** Terapkan pada active email pointer dan pelepasan claim yang harus memeriksa owner.
4. Jalankan kembali `npm run qa` lima kali dan `git diff --check`.

### Gelombang B · QA dan observability berikutnya

1. Tambahkan satu alur auth/session WebKit.
2. Deduplikasi `admin.grant_blocked`.
3. Tambahkan visual baseline untuk homepage, deals grid/list, modal campaign, auth, dashboard, dan admin warning.
4. Tetapkan performance budget untuk mobile p75/p95 dan ukuran JS/CSS, bukan satu angka TTFB.
5. Buat synthetic production flow yang menggunakan akun khusus dan membersihkan data uji dengan aman.

### Gelombang C · sebelum paid acquisition

1. Aktifkan serta buktikan Resend end-to-end di production.
2. Kosongkan daftar `unprovenAdmins` maksimal 24 jam setelah aktivasi.
3. Hidupkan `tap.haluandigital.agency`, canonical, sitemap, OAuth callback, dan preview share pada host tersebut.
4. Tutup 50 sel rate dan 35 brand yang masih perlu cleanup, lalu dokumentasikan 22 campaign yang memang ditahan.
5. Tetapkan retention period, privacy workflow, sample-operation evidence, settlement evidence, dan approver go/no-go.

### Trigger skala R7-09

Keputusan trigger diterima: bangun indeks pencarian admin ketika creator atau request mencapai **10.000 record**, atau p95 endpoint admin melebihi **500 ms**, mana yang lebih dulu. Catat metrik p95 sekarang agar trigger tersebut benar-benar dapat diawasi.

## Gate penerimaan berikutnya

Working tree dapat dipromosikan bila:

- probe dua update nomor paralel meninggalkan satu claim yang cocok dengan record final;
- status admin legacy tidak lagi mengklaim proof yang tidak ada;
- pengecualian admin memiliki owner dan tenggat;
- 5/5 QA tetap hijau dengan 72 atau lebih E2E;
- smoke production dijalankan ulang pada deployment baru, bukan hanya baseline lama.

Paid acquisition tetap memerlukan:

- `unprovenAdmins=0`;
- email production terbukti untuk register, verify, reset, dan failure recovery;
- custom domain hidup;
- visual regression, performance budget, dan synthetic production flow hijau;
- data, retention, operasi sample, dan bukti bisnis selesai.

## Kesimpulan

P1 admin dan race cooldown reset tertutup dengan baik. WebKit juga memberikan nilai nyata, bukan kosmetik pada angka test. Keputusan mempertahankan admin legacy dapat diterima sebagai pengecualian sementara karena mencegah lockout production, dengan syarat statusnya jujur dan tenggatnya eksplisit.

Indeks WhatsApp belum tertutup penuh. Bukti dua PATCH paralel menunjukkan divergence yang persis ingin dicegah oleh indeks tersebut. Tutup satu P2 itu sebelum promosi batch; setelahnya, dengan gate yang sama tetap hijau, keputusan working tree dapat naik dari HOLD menjadi GO WITH CONDITIONS.
