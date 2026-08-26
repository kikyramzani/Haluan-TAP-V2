# TAP by Haluan — QC/QA Depth Review, Putaran 12

**Working tree di atas commit `215a1bf` · Production:** https://haluan-tap.vercel.app · **Tanggal:** 17 Agustus 2026
**Skor audit: 8,6/10**

Review independen atas koreksi tiga P2 putaran 11. Saya membaca implementasi Lua dan seluruh caller lock, menjalankan `npm run qa` lima kali, mengulang probe OTP dan saga, menguji expiry mock secara langsung, serta memeriksa dua host production.

## Keputusan board

| Keputusan | Posisi | Alasan |
|---|---|---|
| Closed beta pada deployment Vercel sekarang | **GO WITH STRICT CONDITIONS** | Baseline live tetap sehat dan tidak memuat working tree ini. |
| Promosi working tree | **HOLD** | P11-02 tertutup. P11-01 dan P11-03 baru tertutup sebagian: release ownership non-lock masih TOCTOU dan OTP masih dapat habis pada lease takeover setelah consume. |
| Peluncuran custom domain | **NO-GO saat audit** | `tap.haluandigital.agency` tetap tidak resolve; smoke 0/9. |
| Paid acquisition | **NO-GO** | Provider email, custom domain, synthetic flow, dan bukti settlement belum memenuhi gate. |
| Pengecualian admin legacy | **Disetujui dan kini time-boxed** | Owner, pemicu, SLA 24 jam, bukti, tindakan jika terlambat, dan hard gate sudah tertulis. |

## Ringkasan board

Perbaikan inti bergerak ke arah yang benar:

- Release dan renewal **record lock** kini benar-benar atomik melalui Lua.
- Acquisition conflict pada reset kini menghasilkan 409 tanpa menghabiskan OTP. Probe yang sama dengan putaran 11 sekarang berhasil diulang memakai kode yang sama.
- Intent tujuh hari dan stale threshold lima menit membuat cron punya waktu recovery yang masuk akal. Probe stale intent diperbaiki dengan benar.
- Tenggat admin legacy memenuhi koreksi board.

Namun klaim “ketiga P2 ditutup” belum lolos review. Ada dua batas yang bukan sekadar catatan arsitektur:

1. Pointer email dan claim nomor masih dilepas dengan `GET`, lalu `DEL`. Risiko menghapus pemilik penerus yang ditemukan pada putaran 11 tetap ada di dua primitive itu.
2. Reset dan verifikasi mengonsumsi challenge sebelum memanggil `guard()`. Jika lease berpindah setelah lock diperoleh tetapi sebelum guard, endpoint mengembalikan 409 sambil challenge sudah hilang. Pesan “kodemu masih berlaku” menjadi salah pada jalur tersebut.

Guard juga tidak dipakai oleh `updateSampleRequest` dan reconciler cron. Ditambah mock yang mengabaikan `PX`, suite lokal tidak pernah membuat lease acquisition kedaluwarsa. Karena itu skor naik tipis menjadi 8,6, tetapi working tree belum layak dipromosikan.

## Bukti yang saya jalankan sendiri

### Gate lokal

| Pemeriksaan | Hasil |
|---|---|
| `npm run qa` | **5/5 exit 0** |
| E2E | **80/80 per run**, 400 eksekusi total |
| Unit test | **14/14 per run**, 70 eksekusi total |
| Dependency audit | **0 vulnerability** pada kelima run |
| Build, TypeScript, lint | lulus pada kelima run |
| `git diff --check` | lulus sebelum laporan ini ditulis |
| Skenario unik | 25 deklarasi `test(...)` + 7 rute accessibility = **32** |
| Sebaran | 31 mobile Chromium, 31 desktop Chromium, 17 mobile WebKit, 1 legacy-auth |

Kenaikan 76 → 80 berasal dari dua skenario baru yang masing-masing berjalan pada dua profil Chromium. Secara jumlah ini cakupan baru yang sah. Kedalaman assertion-nya dibahas di R12-03.

### Probe adversarial

**Acquisition conflict OTP — tertutup**

```text
lock user ditahan eksternal
reset pertama: 409 · kode masih berlaku
challenge setelah konflik: masih ada
retry setelah lock lepas: 200
```

**Saga stale — tertutup selama intent masih ada**

```text
sebelum cron: record menunjuk nomor baru; claim lama dan baru sama-sama ada
cron: phoneClaimsRepaired = 1
sesudah cron: claim lama hilang; claim baru benar; index kosong
```

**Index tanpa intent — queue tertutup, informasi tidak dapat dipulihkan**

```text
cron menghapus anggota phone-intents tanpa payload
claim lama yang yatim tetap ada karena from/to sudah tidak tersedia
```

Ini dapat diterima dengan TTL tujuh hari dan heartbeat cron 26 jam sebagai batas operasional, tetapi tetap perlu tes outage lebih dari satu siklus.

**Expiry mock — gagal**

```text
SET px-expiry-probe held PX 20
GET setelah 50 ms: "held"
```

Mock hanya memproses `EX`; `PX` diabaikan. Lock test lokal karena itu tidak punya TTL sampai release normal atau reset datastore.

### Production

| Pemeriksaan | Hasil |
|---|---|
| Smoke `haluan-tap.vercel.app` | **9/9** |
| Health | `ready` |
| Region | `sin1::sin1` |
| TTFB homepage, 3× | 0,188–0,215 detik |
| Katalog | 310 TikTok · 383 Shopee |
| CSP dan canonical | hadir; canonical memakai host Vercel |
| Smoke `tap.haluandigital.agency` | **0/9**, DNS tidak resolve |

Production belum memuat working tree, jadi hasil 9/9 membuktikan baseline live—bukan koreksi putaran 12.

## Temuan

### R12-01 · P2 — Ownership-safe release masih bukan compare-and-delete

Record lock di `lib/mutation.ts` sudah benar: release dan renewal adalah script atomik. Tetapi perbaikan berhenti di sana.

- `lib/email-auth.ts:38–42` membaca pointer aktif, lalu menghapusnya pada request terpisah.
- `lib/auth.ts:339–342` melakukan pola yang sama untuk claim nomor.
- `reconcilePhoneClaims` dan `deletePendingUser` juga membaca owner, lalu melakukan `DEL` terpisah.

Jika key habis atau berubah ownership di antara kedua call, holder lama dapat menghapus pointer atau claim penerus. Pada nomor WhatsApp, efeknya adalah record pemilik baru kehilangan indeks nomor. Pada email challenge, cooldown pointer baru dapat hilang dan dua pengiriman kembali dimungkinkan.

Ini sudah termasuk gate R11-01 di improvement plan putaran 11. Karena belum diterapkan di primitive non-lock, P11-01 hanya **tertutup sebagian**.

**Perbaikan.** Ekstrak satu helper compare-and-delete Lua dan gunakan untuk setiap key yang dilepas berdasarkan expected owner/id: lock, pointer email, claim nomor, rollback claim, cleanup pending, dan reconciler.

**Selesai bila.** Pergantian owner tepat di antara compare dan delete tidak pernah menghapus nilai baru, dibuktikan dengan takeover test deterministik.

### R12-02 · P2 — OTP masih dapat habis pada post-acquire conflict

Urutan sekarang:

1. `peekEmailChallenge` membaca challenge.
2. `withRecordLock` memperoleh lease.
3. `consumeEmailChallenge` menghapus challenge.
4. Reset membaca user dan mencabut seluruh session.
5. Baru setelah itu `guard()` memeriksa apakah lease masih dimiliki.

Jika lease berpindah pada langkah 3–4, guard melempar `MutationConflictError`. Route mengembalikan 409 dengan pesan bahwa kode masih berlaku, padahal `DEL` challenge sudah terjadi. Reset memperlebar jendela ini karena session revocation dilakukan sebelum guard.

Acquisition conflict yang saya reproduksi memang sudah tertutup. Post-acquire conflict belum tertutup dan tidak dapat diinjeksi oleh mock saat ini. Ini jalur kode deterministik, bukan klaim bahwa ia sering terjadi.

**Perbaikan.** Jadikan pengecekan lease, validasi challenge, konsumsi challenge, dan commit record sebagai satu keputusan atomik; atau simpan operation intent idempoten sebelum challenge dihapus sehingga retry menyelesaikan commit yang sama. Session invalidation sebaiknya menjadi bagian logis record—misalnya session epoch—lalu physical cleanup dapat berjalan setelah commit.

**Selesai bila.** Lease takeover sebelum dan setelah consume sama-sama menghasilkan salah satu dari dua hasil: kode tetap dapat dipakai, atau mutasi sudah committed dan retry mengembalikan hasil idempoten. Tidak boleh ada 409 dengan challenge hilang.

### R12-03 · P3 — Dua E2E baru tidak membuktikan klaim pada namanya

Tes “kode sekali pakai tidak hangus ketika record sedang terkunci” tidak pernah menahan lock. Ia hanya mengirim dua reset paralel, menerima status kedua 400 atau 409, dan tidak pernah melakukan retry challenge. Login terakhir hanya membuktikan request pemenang mengganti password.

Tes intent baru hanya memeriksa successful move meninggalkan queue kosong. Ia tidak menyuntik stale intent, missing intent, atau kegagalan di antara claim, record, release, dan cleanup.

Keduanya tetap berguna sebagai regression smoke. Keduanya belum menjadi bukti penutupan P11-02/P11-03.

### R12-04 · P3 — Mock tidak mengimplementasikan TTL yang dipakai lock

Production memakai `SET ... NX PX 10000`. Mock hanya mencari opsi `EX`, sehingga acquisition lock tidak pernah kedaluwarsa. Script renewal memang diuji secara sintaksis, tetapi lifecycle lease—expiry, takeover, renewal, dan stale release—tidak diuji.

**Perbaikan.** Implementasikan `PX` pada mock dan tambahkan tes langsung: expiry, wrong-token release, correct-token release, renewal, takeover, serta holder lama yang mencoba guard setelah takeover.

### R12-05 · P3 — Tidak semua writer memakai guard

`updateSampleRequest` menerima callback tanpa parameter dan langsung menulis sample. `reconcileStalePhoneClaims` juga mengabaikan guard ketika menjalankan perbaikan claim. Jadi klaim “setiap writer memanggil guard tepat sebelum commit” tidak sesuai kode.

**Perbaikan.** Wajibkan guard pada dua caller tersebut. Lebih baik ubah API primitive agar commit harus melewati method yang melakukan guard, sehingga caller tidak dapat lupa hanya karena TypeScript mengizinkan callback dengan parameter lebih sedikit.

### R12-06 · P3 — Kontrak konflik runbook masih terlalu luas

Runbook masih menyatakan semua caller menerima 409. Profil, sample, reset, dan verifikasi memetakan konflik ke 409. Update membership masih menangkap semua error sebagai 404; cron menelan konflik sebagai “tidak diperbaiki”; Google dan rekonsiliasi admin punya perilaku lain.

Tetapkan kontrak per caller, lalu tulis kontrak itu di runbook. Pekerjaan sistem sebaiknya retry/telemetry; mutasi interaktif sebaiknya 409; bukan semuanya satu respons.

## Penilaian klaim koreksi putaran 11

| Klaim | Penilaian |
|---|---|
| Release dan renewal record lock atomik via Lua | **Terkonfirmasi.** Implementasi EVAL benar secara struktur. |
| Mock menguji kontrak yang sama | **Sebagian.** EVAL dikenali, tetapi `SET PX` tidak punya expiry. |
| Setiap writer menjalankan guard sebelum commit | **Tidak benar.** Sample updater dan reconciler tidak memakai guard. |
| Lease takeover membatalkan write dengan 409 | **Sebagian.** Writer yang memanggil guard berhenti; tidak ada true fencing dan tidak ada takeover test. |
| Intent tujuh hari dan stale lima menit | **Terkonfirmasi.** Probe cron stale berhasil. |
| Index tanpa intent dibersihkan | **Terkonfirmasi.** Queue bersih; orphan lama tidak dapat direkonstruksi tanpa payload. |
| OTP tidak habis pada lock conflict | **Terkonfirmasi untuk acquisition conflict.** Belum benar untuk post-acquire guard conflict. |
| Export lama dihapus | **Terkonfirmasi.** Route memakai API challenge-aware baru. |
| Tenggat admin legacy lengkap | **Terkonfirmasi.** |
| Gate 5/5, 80 E2E, 14 unit, 0 vulnerability | **Terkonfirmasi secara independen.** |

## Skor

Model bobot sama dengan putaran 9–11.

| Area | Bobot | Skor | Kontribusi | Yang menentukan |
|---|---:|---:|---:|---|
| Security & privacy | 16% | 9,0 | 1,44 | Lock release atomik dan admin deadline membaik; pointer release dan admin legacy tetap terbuka. |
| Functional correctness | 14% | 8,8 | 1,23 | Acquisition conflict dan saga stale benar; post-acquire OTP masih salah. |
| QA depth | 12% | 9,2 | 1,10 | 5×80 stabil dan 32 skenario unik; dua tes baru tidak menguji kondisi pada namanya, PX/failure injection belum ada. |
| Reliability | 10% | 8,0 | 0,80 | TTL saga masuk akal; lease lifecycle dan idempotensi OTP belum lengkap. |
| Data integrity | 10% | 8,0 | 0,80 | Lost update utama tertahan; claim release TOCTOU dan guard sample tersisa. |
| UX | 10% | 9,0 | 0,90 | Retry acquisition kini benar; pesan 409 masih salah pada post-acquire conflict. |
| Performance | 8% | 8,8 | 0,70 | Snapshot production sehat; belum ada budget/p95 historis. |
| Accessibility | 6% | 8,8 | 0,53 | Axe dua engine; belum ada screen-reader/manual pass. |
| SEO | 5% | 8,6 | 0,43 | Canonical Vercel hidup; custom domain belum resolve. |
| Visual consistency | 5% | 7,9 | 0,40 | Responsive fix ada; visual regression belum tersedia. |
| Trust & proof | 4% | 6,6 | 0,26 | Deadline admin memperbaiki governance; settlement dan bukti bisnis belum ada. |
| **Total** | **100%** |  | **8,60 → 8,6/10** |  |

## Improvement plan

### Gelombang A12 — sebelum promosi · ±½–1 hari

1. **R12-01:** helper atomic compare-and-delete untuk seluruh pointer dan claim ownership-sensitive.
2. **R12-02:** commit OTP idempoten/atomik terhadap lease dan challenge; session invalidation tidak boleh membuka gap sebelum guard.
3. **R12-04:** dukungan `PX` pada mock dan takeover/fencing tests.
4. **R12-05:** guard wajib pada sample updater dan reconciler; buat API yang sulit disalahgunakan.
5. **R12-06:** map konflik per endpoint/job dan koreksi runbook.

### Gate promosi

6. E2E benar-benar menahan lock, menerima 409, lalu retry challenge yang sama sampai 200.
7. Failure injection memindahkan lock setelah challenge consume; hasil harus idempoten atau challenge tetap hidup.
8. Takeover test pada email pointer dan phone claim membuktikan holder lama tidak menghapus owner baru.
9. Saga test berhenti setelah journal, claim, record, release lama, dan cleanup; cron menyelesaikan tiap fase.
10. `npm run qa` lima kali dan `git diff --check` setelah perubahan terakhir.

### Gelombang B — tidak berubah

11. Auth smoke WebKit.
12. Visual regression enam permukaan utama.
13. Performance budget dan synthetic production flow.
14. Aktifkan Resend dan custom-domain DNS; kedua host wajib smoke 9/9.
15. `unprovenAdmins` nol maksimal 24 jam setelah Resend aktif.

### Sebelum paid acquisition

16. Satu closed-beta campaign selesai sampai settlement dengan bukti yang dapat diaudit.
17. Tutup gap campaign, logo, masa berlaku, dan intake sample yang sudah tercatat.

Trigger indeks pencarian admin tetap: **10.000 record atau p95 endpoint admin >500 ms**, mana lebih dulu.

## Gate penerimaan berikutnya

1. R12-01 dan R12-02 tertutup dengan takeover/failure injection, bukan hanya code review.
2. Mock membuktikan lease benar-benar kedaluwarsa dan dapat diperpanjang.
3. Semua callback yang menulis record tidak dapat melewati guard.
4. Tidak ada 409 OTP yang diikuti challenge hilang tanpa commit.
5. Lima gate QA hijau setelah seluruh koreksi.
6. Deployment Vercel 9/9; custom domain 9/9 hanya menjadi gate saat DNS diaktifkan.

## Cara verifikasi dijalankan

- `npm run qa` lima kali berturut-turut: exit 0 semua, 80 E2E per run.
- Probe lokal pada build production: acquisition conflict OTP, retry challenge yang sama, saga stale, missing intent, dan expiry `PX` mock.
- `npm run smoke:production` dijalankan pada kedua host.
- Seluruh callback `withRecordLock`, script EVAL, ownership release, route mapping, cron schedule, dan dokumentasi ditelusuri langsung.
- Tidak ada source code produk yang diubah oleh audit; hanya laporan dan improvement plan diperbarui.
