# TAP by Haluan — QC/QA Depth Review, Putaran 10

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,4/10**

Review independen atas pohon kerja yang sama dengan putaran 9. Semua angka di bawah saya hasilkan sendiri: `npm run qa` lima kali, smoke production, pengukuran header dan TTFB, serta **reproduksi langsung** dua race pada jalur tulis profil.

---

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Closed beta di production | **GO WITH STRICT CONDITIONS** | Production sehat, tetapi T10-01 dan T10-02 sudah ada pada baseline live. Form UI mengirim field lengkap, namun multi-tab dan klien parsial tetap berisiko. |
| Promosi seluruh working tree | **HOLD** | Dua P2 pada mutasi user dan pengerasan lifecycle challenge harus ditutup lebih dulu. |
| Paid acquisition | **NO-GO** | `unprovenAdmins` belum nol, bukti settlement belum ada |
| Pengecualian admin legacy | **Setuju, dengan tenggat** | Sama seperti putaran 9; tambahkan tenggat tertulis, bukan hanya syarat |

---

## Ringkasan

Dua dari tiga temuan putaran 8 memang tertutup penuh, dan penilaian putaran 9 atas indeks WhatsApp benar. Saya mereproduksinya sendiri dan hasilnya persis seperti dilaporkan.

Yang berbeda: **akar masalahnya lebih luas dari indeks WhatsApp.** Jalur tulis profil tidak punya kontrol konkurensi sama sekali, dan endpoint-nya menimpa seluruh field pada setiap panggilan. Klaim nomor yatim hanyalah gejala yang paling mudah dilihat. Satu P2 tambahan dan satu invariant defect P3 tidak disebut di laporan putaran 9.

Karena itu skor 8,4 — sedikit di bawah 8,6 — dapat diterima. Dengan model board yang sama, dampaknya tersebar pada Data integrity, Functional correctness, dan Reliability.

---

## Bukti yang saya jalankan sendiri

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | **5/5 exit 0** |
| E2E per run | **72 lolos**, 48–52 detik |
| Unit/security | **14/14** |
| Dependency audit | **0 vulnerability** |
| `git diff --check` | lulus |
| Skenario unik | 21 `test(...)` + 7 rute accessibility = 28 |
| Sebaran engine | Chromium 55 eksekusi, WebKit 17 |

Angka 28 skenario dan sebaran engine cocok dengan laporan putaran 9.

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke | **9/9** |
| Health | `ready` |
| Region | `sin1::sin1` |
| TTFB homepage (3×) | 0,181 – 0,186 detik |
| CSP di route API | terpasang |
| Canonical `/deal/mistine` | `https://haluan-tap.vercel.app/deal/mistine` |
| Katalog | 310 record · 50 sel dikecualikan · 22 campaign tidak tayang |

Production tidak memuat remediasi working tree, tetapi pola PATCH parsial dan lost update profil sudah ada pada commit baseline. Dashboard live juga menyediakan dan mendorong penggunaan form profil. Closed beta tetap dapat berjalan karena form saat ini mengirim seluruh field dan menonaktifkan tombol selama submit, dengan syarat edit multi-tab serta klien API parsial tidak digunakan sebelum perbaikan live.

---

## Temuan

### T10-01 · P2 — Jalur mutasi user tidak punya kontrol konkurensi bersama

Ini akar dari R9-01, dan cakupannya lebih luas dari indeks WhatsApp. `updateProfile` membaca record, menyusun objek baru, lalu menulis kembali seluruhnya. Tidak ada lock, versi, maupun compare-and-set. Ada tujuh lokasi `SET` pada record user, satu jalur `deletePendingUser`, dan satu updater record sample yang perlu diaudit sebagai satu keluarga mutasi.

**Reproduksi 1 — klaim nomor yatim (mengonfirmasi R9-01).** Dua PATCH paralel dengan nomor berbeda:

```
status: [200, 200]
nomor tersimpan: 6281200000003
  claim 6281200000001: kosong
  claim 6281200000002: menunjuk user   ← yatim
  claim 6281200000003: menunjuk user
```

Nomor …002 terkunci selamanya terhadap akun lain, padahal tidak ada yang memakainya.

**Reproduksi 2 — field hilang.** Dua PATCH paralel yang menulis field berbeda:

```
status: [200, 200]
niche: ""  |  recipientName: "Penerima Baru"
SATU FIELD HILANG
```

**Perbaikan.** Buat satu primitive mutasi bersama per user, bukan lock khusus profil. Seluruh writer—Google upsert, verifikasi, reset password, rekonsiliasi admin, membership, profil, dan penghapusan pending—harus memperoleh lock yang sama lalu membaca ulang record di dalam critical section. Gunakan token unik, TTL pendek, dan compare-and-delete saat melepas lock; map konflik ke 409 yang bisa dicoba ulang. Terapkan primitive setara per sample.

Lock menutup lost update, tetapi belum membuat perubahan record user dan indeks nomor menjadi satu commit. Untuk menutup orphan saat proses atau datastore gagal di tengah, mutasi nomor multi-key tetap memerlukan Lua/EVAL, transaction yang setara, atau saga durable dengan rekonsiliasi otomatis.

**Selesai bila.** Seluruh writer user serta delete path memakai primitive yang sama; dua PATCH paralel menghasilkan tepat satu claim nomor; dan kegagalan pada tiap fase mutasi multi-key tidak meninggalkan divergence.

### T10-02 · P2 — `/api/profile` menimpa field yang tidak dikirim

Terpisah dari konkurensi, dan lebih mudah dipicu. Route selalu menulis seluruh field: `cleanText(body.niche, 80)` atas field yang tidak ada menghasilkan string kosong, lalu ditulis ke record.

Bukti dari reproduksi di atas: PATCH pertama hanya mengirim `name` dan `phone`, dan `niche` yang sudah terisi berubah menjadi `""`.

Formulir dashboard selalu mengirim seluruh field sehingga UI saat ini tidak terdampak. Tetapi ini PATCH hanya pada namanya, dan setiap klien parsial — retry, integrasi, atau form baru — akan menghapus alamat dan niche creator tanpa jejak. Cacat sejenis pernah ditutup untuk request sample di putaran 2; jalur profil tidak pernah ikut diperbaiki.

**Perbaikan.** Masukkan field ke objek update hanya bila `Object.hasOwn(body, field)`, persis seperti `app/api/admin/sample-requests/route.ts`.

### T10-03 · P3 — Registrasi menggunakan reservasi yang tidak dimilikinya

`app/api/auth/register/route.ts:25` memanggil `reserveEmailSend`, lalu memakai `reservation.id` apa adanya. Ketika reservasi **gagal**, ID itu berasal dari pointer aktif yang tidak dimiliki request ini, tetapi `createEmailChallenge` tetap menulis record baru di atas ID tersebut.

Probe atas jalur yang benar-benar dapat dicapai memberi hasil lebih sempit: registrasi pertama gagal mengirim email dan meninggalkan pointer serta challenge yang belum terkirim; retry membuat user baru, menerima `reserved=false`, lalu menulis ulang ID lama dan berhasil mengirim. ID sama, `userId` challenge berubah, tetapi tidak ada kode lama yang pernah mendarat di inbox. Registrasi kedua untuk email yang sudah punya challenge terkirim tetap dihadang `EMAIL_EXISTS`.

Jadi ini invariant defect yang perlu ditutup, tetapi bukti saat ini mendukung P3, bukan P2. Jangan mengakali kegagalan reservasi dengan ID baru karena itu melewati hak kirim. Pada kegagalan registrasi, hapus challenge dan pointer secara ownership-safe sebelum menghapus user. Jika `reserved=false`, fail closed dan rollback user; jangan membuat atau mengirim challenge baru.

### T10-04 · P3 — Pointer challenge dihapus tanpa memeriksa kepemilikan

Mengonfirmasi R9-05. `consumeEmailChallenge` menghapus pointer aktif alamat itu tanpa memastikan pointer tersebut menunjuk challenge yang baru saja dipakai. Setelah jendela kirim ulang lima menit, konsumsi kode lama menghapus pointer milik kode yang lebih baru. Kode baru tetap sah, tetapi perilaku berbagi challenge hilang sampai permintaan berikutnya.

**Perbaikan.** Baca pointer lebih dulu dan hapus hanya bila nilainya sama dengan id yang dikonsumsi.

### T10-05 · P3 — `admin.grant_blocked` ditulis pada setiap permintaan

Mengonfirmasi R9-04. `reconcileAdminRole` menulis satu audit event setiap kali akun yang ada di allowlist tetapi belum terbukti menyentuh permukaan admin. Satu operator yang membuka `/admin` berulang kali, atau satu tab yang memuat ulang, cukup untuk mendorong event lain keluar dari 100 event terakhir yang dibaca UI.

**Perbaikan.** Catat paling banyak satu kali per akun per jam dengan penjaga `SET NX EX 3600`.

### T10-06 · P3 — WebKit belum menyentuh auth dan session

Mengonfirmasi R9-03. Matcher `mobile-webkit` hanya mencakup spec publik dan aksesibilitas. Padahal perbedaan engine yang paling mahal justru ada di cookie, penyimpanan, dan navigasi setelah login — dan WebKit sudah membuktikan nilainya: penambahannya menemukan dua masalah nyata dalam menit-menit pertama.

**Perbaikan.** Tambahkan satu skenario auth WebKit: daftar, verifikasi, masuk, buka dashboard, keluar.

---

## Penilaian atas klaim putaran 9

| Klaim putaran 9 | Penilaian saya |
|---|---|
| Dua dari tiga temuan putaran 8 tertutup penuh | **Setuju.** Pemberian admin dan race cooldown tertutup; keduanya saya baca ulang di kode |
| Indeks WhatsApp masih parsial | **Setuju, dan lebih dalam.** Direproduksi; akarnya konkurensi, bukan indeks — lihat T10-01 |
| Gate 5/5, 72 E2E, 28 skenario, 0 vulnerability | **Terkonfirmasi**, dijalankan sendiri |
| Production smoke 9/9 | **Terkonfirmasi** |
| Pengecualian admin legacy | **Setuju**, dan syaratnya tepat. Tambahkan tenggat tertulis |
| Tiga P3 lanjutan | **Terkonfirmasi ketiganya** (T10-04, T10-05, T10-06) |

Yang tidak tertangkap putaran 9: **T10-02** (PATCH menimpa field) dan **T10-03** (registrasi memakai reservasi yang tidak dimilikinya). T10-02 memperluas akar R9-01; T10-03 adalah invariant defect terpisah pada lifecycle challenge.

---

## Skor

Skor putaran 9 memakai bobot, sedangkan tabel awal putaran 10 memakai rata-rata atas kategori yang berbeda. Agar angka 8,4 dan 8,6 dapat dibandingkan langsung, penilaian berikut mempertahankan model board putaran 9.

| Area | Bobot | Skor | Kontribusi | Yang menentukan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 9,0 | 1,44 | Grant baru proof-gated, revocation seketika, OTP atomik, CSP penuh; admin legacy tetap risk exception. |
| Functional correctness | 14% | 8,2 | 1,15 | PATCH parsial destruktif dan lost update terbukti. |
| QA depth | 12% | 9,6 | 1,15 | 5×72 stabil dan dua engine; auth WebKit serta visual/perf/synthetic belum ada. |
| Reliability | 10% | 7,8 | 0,78 | Seluruh writer user belum berbagi kontrol konkurensi dan commit multi-key dapat berhenti di tengah. |
| Data integrity | 10% | 6,8 | 0,68 | Claim yatim, field hilang, dan mutasi multi-key belum atomik. |
| UX | 10% | 8,8 | 0,88 | Mobile discovery kuat; profil dapat menghapus data tanpa warning. |
| Performance | 8% | 8,8 | 0,70 | Snapshot production baik; belum ada budget dan p95 historis. |
| Accessibility | 6% | 8,8 | 0,53 | Axe dua engine; belum ada pemeriksaan manual/screen reader. |
| SEO | 5% | 9,0 | 0,45 | Canonical benar; custom domain belum hidup. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix terbukti; visual regression belum tersedia. |
| Trust & proof | 4% | 6,5 | 0,26 | Provider, settlement, retention, dan bukti bisnis belum lengkap. |
| **Total** | **100%** |  | **8,42 → 8,4/10** |  |

Skor 8,4 diterima. Penurunannya bukan hanya Data integrity: temuan yang sama juga menekan Functional correctness dan Reliability. Security naik, tetapi 9,5 terlalu dekat ke sempurna selama admin legacy tanpa proof masih dipertahankan dan audit keputusan tetap best-effort.

---

## Improvement plan

### Gelombang A — sebelum promosi working tree · 1–1½ hari

1. **T10-01** — primitive mutasi bersama pada seluruh writer record user, termasuk `deletePendingUser`; token unik, TTL, compare-and-delete, dan 409 yang dapat dicoba ulang. Terapkan primitive per record sample.
2. **T10-02** — hanya tulis field yang benar-benar dikirim, memakai `Object.hasOwn`.
3. **Indeks nomor** — commit record dan claim nomor secara atomik atau tambahkan saga durable serta rekonsiliasi otomatis. Lock saja tidak menutup crash di tengah mutasi multi-key.
4. **T10-03** — cleanup penuh pada registrasi gagal; bila reservasi tidak dimiliki, fail closed dan rollback. Jangan memakai ID aktif ataupun ID baru untuk melewati reservasi.
5. **T10-04** — hapus pointer challenge hanya bila cocok.
6. **T10-05** — penjaga satu jam untuk `admin.grant_blocked`.

Setelah seluruh enam item: `npm run qa` lima kali berturut-turut, lalu promosi.

### Gelombang B — QA berikutnya · 1–2 hari

7. **T10-06** — satu skenario auth di WebKit.
8. Baseline visual untuk homepage, katalog, auth, detail deal, dashboard, admin.
9. Performance budget pada TTFB dan ukuran transfer, dijalankan terhadap production.
10. Synthetic production flow: daftar, masuk, buka deal, ajukan sample.

### Gelombang C — sebelum paid acquisition

11. Aktifkan Resend dan DNS. Dalam 24 jam setelahnya, seluruh admin legacy melakukan reset sehingga `unprovenAdmins` menjadi nol.
12. Ubah label “Administrator terverifikasi” untuk akun tanpa bukti, sesuai syarat board putaran 9.
13. Daftar admin legacy dengan pemilik risiko dan tenggat tertulis.

### Gelombang D — ops, aset, dan bukti

14. 22 campaign tidak tayang: pemilik dan tenggat.
15. ±100 logo brand; cakupan sekarang 50% dan 57%.
16. Konfirmasi intake sample Shopee.
17. Satu campaign closed beta tuntas dengan bukti settlement yang boleh dipublikasikan.

### Trigger skala

Indeks pencarian admin dikerjakan saat menembus **10.000 record** atau **p95 endpoint admin >500 ms**, mana lebih dulu.

---

## Gate penerimaan berikutnya

1. Semua writer user memakai primitive mutasi yang sama; cleanup dan verifikasi tidak dapat menginterleave record.
2. Dua PATCH profil paralel: satu klaim nomor, nol field hilang, dibuktikan E2E.
3. PATCH parsial tidak mengubah field yang tidak dikirim.
4. Kegagalan/crash pada setiap fase mutasi nomor tidak meninggalkan claim yatim.
5. Registrasi gagal membersihkan pointer/challenge; reservasi yang kalah tidak pernah ditulis ulang.
6. `npm run qa` lima kali hijau setelah seluruh Gelombang A.
7. WebKit mencakup minimal satu alur auth.
8. `unprovenAdmins` nol sebelum paid acquisition, dengan tenggat tertulis sejak Resend aktif.

---

## Cara verifikasi dijalankan

- `npm run qa` 5× berturut-turut: exit 0 semua, 72 E2E per run, 14 unit test, 0 vulnerability.
- `npm run smoke:production` terhadap production: 9/9.
- Header, region, TTFB, canonical, dan katalog production dibaca langsung.
- Race jalur profil direproduksi dua kali dengan server lokal dan mock datastore: klaim nomor yatim dan kehilangan field, keduanya dari dua PATCH paralel.
- Tujuh lokasi `SET` record user, satu delete path user, dan satu updater record sample ditelusuri sebagai keluarga mutasi yang sama.
- `git diff --check` lulus; pohon kerja berisi 42 berkas berubah/baru, termasuk laporan audit ini.
