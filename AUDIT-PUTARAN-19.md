# TAP by Haluan — QC/QA Depth Audit, Putaran 19

- **Tanggal:** 19 Agustus 2026, pasca-promosi production
- **Production yang diuji:** `https://tap.haluandigital.agency` + `https://haluan-tap.vercel.app`
- **Commit tayang:** `e1e357d91ffacbd805881f23ba6ee3fbf4246c8a` (terverifikasi via `/api/version`, `ok:true`, region `sin1`)
- **Skor board: 8,6/10** — naik dari 4,9 readiness, karena untuk pertama kalinya *yang diuji adalah yang tayang*

## Ringkasan

Putaran ini berbeda dari delapan belas sebelumnya dalam satu hal yang mengubah bobot semua temuan: **production truth akhirnya PASS.** Domain resmi hidup, smoke 10/10 di kedua host dengan `EXPECTED_COMMIT` di-pin, dan rantai "gate lulus di SHA X" → "publik melihat SHA X" tersambung oleh endpoint yang fail-closed, bukan oleh asumsi.

Tiga simpul yang menahan sembilan putaran audit terurai dalam satu malam: identitas committer (`hdrvstudio-hash` — akun nyasar, terhapus, email dipindah, 53 commit teratribusi ulang tanpa satu SHA pun berubah), pipeline git→Vercel (blokir yang ternyata ada sejak commit pertama project dan selama ini "disembuhkan" manual lewat CLI), dan DNS domain resmi.

Namun promosi ini juga **menciptakan satu keadaan berbahaya yang tidak ada kemarin**, dan itu temuan utama putaran ini.

## Temuan

### R19-01 · P0 — `main` 15 commit di belakang production, dan push ke `main` men-deploy production

Production menyajikan `e1e357d` (di-deploy via CLI dari branch `ux/visual-review-p0`). `origin/main` masih `215a1bf`. `vercel.json` yang tayang **tidak** memuat `git.deploymentEnabled.main=false`, dan production branch project adalah `main`.

Konsekuensinya: **push apa pun ke `main` — commit dokumentasi, merge yang salah, apa pun — memicu build production dari `main`, yang berisi model admin lama yang bisa dieksploitasi.** Seluruh hardening 21 commit akan tergulung diam-diam oleh satu push yang tampak tidak berbahaya, dan sekarang push git *berhasil* men-deploy (blokirnya sudah sembuh — pedang bermata dua).

**Perbaikan (satu perintah, fast-forward murni):** `main` 0 commit di depan `e1e357d`, jadi bisa fast-forward tanpa merge commit. Menyelaraskan `main` = production juga otomatis menandai PR #1 sebagai merged (head-nya `55ac23d` adalah ancestor `e1e357d`), dan build production hasil push itu identik dengan yang sudah tayang.

### R19-02 · P0 operasional — admin terakhir akan tercabut pada sentuhan berikutnya

Audit delapan dimensi pasca-deploy: `unproven=1 · slot=1 · tanpa-allowlist=1`. Dengan kode yang *sekarang tayang*, `admin.tap@haluandigital.agency` (bukan anggota allowlist) **dicabut pada request admin berikutnya** — dan setelah itu **tidak ada admin yang berfungsi sama sekali**: alamat di allowlist belum punya akun, dan kode baru tidak memberi admin pada signup.

Sisi baiknya: slot terbuka itu **tidak lagi bisa dieksploitasi** (itu justru bukti hardening bekerja). Sisi buruknya: satu kunjungan tak sengaja ke `/admin` mengunci operator keluar sampai env diganti.

**Perbaikan (milik pemilik, dua menit):** ganti `ADMIN_EMAILS` di Vercel menjadi `admin.tap@haluandigital.agency`, redeploy, lalu akun itu membuktikan kepemilikan sekali lewat reset password → delapan hitungan audit nol.

### R19-03 · P1 — canonical dan sitemap menunjuk host yang salah

Domain resmi menyajikan konten, tetapi `<loc>` sitemap (dan canonical) masih `https://haluan-tap.vercel.app` karena `NEXT_PUBLIC_SITE_URL` belum diset. Dua host 200 dengan konten identik + canonical menunjuk host sekunder = sinyal duplikat yang merugikan domain resmi tepat saat ia baru lahir.

**Perbaikan:** set `NEXT_PUBLIC_SITE_URL=https://tap.haluandigital.agency` → redeploy; jadikan `haluan-tap.vercel.app` redirect di setelan Domains.

### R19-04 · P1 — commit production belum pernah disentuh CI independen

Nol run Actions pada `e1e357d` (budget masih habis). Bukti yang menopang promosi: gate lokal 7× lintas SHA (46 unit/contract, 145 E2E, 0 vuln, artifact ber-checksum) + smoke production 10/10. Kuat, tapi satu mesin. Blocker-nya billing, bukan kode.

### R19-05 · P2 — kebersihan pasca-operasi

Branch buangan `preview/ux-p0` + probe commit `33780a3` sudah menunaikan tugasnya (membuktikan blokir sembuh) dan layak dihapus; PR #1 akan tertutup otomatis oleh R19-01; preview CLI ganda boleh diabaikan (expire sendiri). Satu campaign live ber-`delta null` tampil benar (pil "belum diverifikasi") — backlog verified-stats lama tetap terbuka.

## Scorecard

| Area | Skor | Catatan |
|---|---:|---|
| Production truth | 9,5 | SHA terverifikasi ujung-ke-ujung; dua host konsisten |
| Keamanan tayang | 9,0 | Seluruh hardening live; sisa = env admin (R19-02) |
| QC/QA depth | 9,0 | 46 unit + 145 E2E + smoke ber-pin; belum CI independen |
| Data & klaim | 8,8 | Poin, WIB, fail-closed tayang; verified-stats backlog |
| Aksesibilitas | 8,8 | 0 pelanggaran serius dua tema; state matrix belum penuh |
| Release engineering | 6,0 | R19-01 menganga; deploy CLI dari laptop; governance belum aktif |
| SEO/domain | 7,0 | Domain hidup; canonical salah arah (R19-03) |
| Ops | 6,5 | R19-02; cron 401 (terproteksi, benar); runbook mutakhir |
| **Board keseluruhan** | **8,6** | Naiknya nyata karena risikonya sekarang *sisa*, bukan *utama* |

## Improvement plan

**Hari ini (urutan penting):**
1. **R19-01** — fast-forward `main` → `e1e357d`, verifikasi build production hasil push identik (deployment id boleh beda, commit sama). *Sebelum* ada push lain ke main.
2. **R19-02** — ganti `ADMIN_EMAILS` (+ sekalian `NEXT_PUBLIC_SITE_URL`, satu redeploy untuk keduanya), reset password admin, audit sampai delapan nol.
3. **R19-05** — hapus branch buangan.

**Minggu ini:** pulihkan budget Actions → CI hijau di `main`; redirect host vercel.app; undang reviewer; terapkan governance batch (workflow dual-identitas, CODEOWNERS, protection dua fase — semua sudah didraf).

**Berikutnya (backlog produk, urutan board putaran 18):** trust transparency (last-sync timestamp, rate methodology) → card utility → saved deals → identitas visual TAP → recently viewed → motion.

## Putusan board

| Item | Putusan |
|---|---|
| Production `e1e357d` di domain resmi | **DITERIMA — tayang, terverifikasi** |
| Selaraskan `main` (R19-01) | **GO segera** |
| Env admin + site URL (R19-02/03) | **GO — tindakan pemilik** |
| Klaim "10/10" | **BELUM** — plafon jujur tetap menunggu CI independen, reviewer, dan pemisahan otoritas; malam ini menaikkan *kenyataan*, bukan sekadar angka |
