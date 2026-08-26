# TAP by Haluan — Production Board Review

Tanggal review ulang: 16 Agustus 2026

Baseline yang dikoreksi: commit `8269a9e`

Target: creator affiliate Indonesia, mobile-first

## Executive verdict

**Skor audit baseline: 5,5/10. Putaran 2: 6,9/10. Status setelah remediation putaran 2: regression gate hijau; belum 10/10 sampai dependency operasional di bawah ditutup.**

Klaim 9,5/10 pada versi dokumen sebelumnya ditarik. Fondasi auth, session, role gate, membership, security header, dan struktur data memang kuat, tetapi itu tidak membenarkan angka readiness ketika integritas rate, discoverability, dan quality gate masih bermasalah.

Paid acquisition creator baru tetap **no-go** sampai P0 tervalidasi di production dan alur sample Shopee dikonfirmasi tim ops. Closed beta internal boleh berjalan untuk menguji operasi, bukan untuk membuat klaim publik.

## Bukti remediation saat ini

- Parser rate bersifat fail-closed. Format tunggal (`13%`, `7,5%`) dan rentang eksplisit (`10-13%`) diterima; daftar tier ambigu (`11,12,13%`) ditolak.
- Audit sumber live menemukan 50 sel ambigu pada 35 brand. Record tersebut dikeluarkan dari katalog, bukan ditebak.
- `openPlan <= 0` menjadi `open plan belum diverifikasi`; delta tidak dihitung dan record tidak masuk urutan “extra terbesar”.
- Unit test memakai fixture semua kelas format rate yang didukung dan ditolak.
- E2E memakai fixture CSV lokal. Smoke test sumber live dipisahkan dari merge-blocking quality gate.
- Shortcut `⌘K` hanya diuji pada desktop.
- Endpoint katalog dan link publik diberi rate limit. Katalog tanpa raw link kembali cacheable; endpoint raw link tetap `private, no-store`.
- Halaman brand sekarang memuat kategori, rate, delta, sample, jumlah link, dan footer legal.
- Homepage dan katalog merender data di server, sitemap dibangun dari katalog, base URL berasal dari environment, dan fallback klaim angka saat API gagal dihapus.
- Bug PATCH parsial, status admin yang tidak sinkron, dan retensi attributed opens diperbaiki.
- Navigasi bawah mobile, skip link, focus trap modal homepage, headline mobile solid, dan kepadatan above-the-fold ditambahkan.
- Tombol Google tidak lagi bergantung pada health endpoint; server meneruskan feature flag dari environment dan E2E membuktikan tombol tampil saat OAuth dikonfigurasi.
- Admin menampilkan ringkasan 50 sel/35 brand/9 brand tidak tayang dan menyediakan audit trail read-only dengan before/after.
- Homepage tidak lagi mengunduh dua katalog di browser; `/deals` hanya memuat katalog platform aktif dan mengambil platform kedua ketika dipilih.
- Public navigation sadar sesi, campaign picker sample dapat dicari, modal tidak lagi bertabrakan dengan bottom navigation, dan bottom navigation tidak tampil di workspace admin/dashboard.

## Status temuan

| Area | Status | Catatan |
|---|---|---|
| F1 rate ambigu | Selesai di kode | Perlu ops menyeragamkan 50 sel agar brand bisa diterbitkan kembali. |
| F2 open plan 0% | Selesai di kode | Tidak dihitung sebagai delta dan diurutkan terakhir. |
| F3 quality gate | Selesai di kode | Unit/E2E offline; smoke live terpisah. |
| F4 SEO katalog | Selesai di kode | Homepage, katalog, landing brand, dan sitemap memuat data hasil render server. |
| F5 link publik | Selesai sebagai keputusan produk | Link tetap publik, throttled, dan dokumentasi diselaraskan. Moat bukan kerahasiaan link. |
| F6 landing brand | Selesai di kode | Rate/sample/detail/legal ditambahkan. |
| F7 navigasi mobile | Selesai di kode | Bottom navigation Deal, Sample, Akun. |
| F8 deal above-the-fold | Selesai di kode | Pixel 7 E2E memastikan kartu homepage dan katalog masuk viewport pertama. |
| F9 expiry kosong | Selesai di kode | Baris disembunyikan bila tanggal tidak tersedia. |
| F10 verifikasi/reset email | Belum | Membutuhkan provider email, token lifecycle, dan keputusan produk. |
| F11–F13 operasi | Selesai di kode | PATCH parsial, transisi tunggal, dan pruning click set. |
| F14 audit viewer | Selesai di kode | Admin memiliki layar read-only aktor, aksi, target, before, dan after. |
| F15 pagination admin | Belum | PII masih harus dipaginasi dan dicari dari server. |
| F16 lazy catalog | Selesai di browser | Data dirender server; client hanya menerima platform aktif dan platform kedua dimuat saat dipilih. |
| F17 nav sadar sesi | Selesai di kode | Public nav berubah ke nama creator dan Dashboard ketika sesi aktif. |
| F18 logo pihak ketiga | Selesai di kode | Google favicon dihapus; fallback memakai inisial lokal. |
| F19–F24 visual/a11y | Parsial | Headline, skip link, focus trap utama, dan target sentuh dibenahi; audit glyph/tab semantics menyeluruh masih diperlukan. |
| F25 klaim tanpa sumber | Selesai di kode | Fallback angka dihapus dan rate hero diberi label ilustrasi. |
| F26 base URL | Selesai di kode | `NEXT_PUBLIC_SITE_URL` menjadi sumber canonical/sitemap. |
| F27 nonce CSP | Belum | `unsafe-inline` masih perlu dihilangkan. |
| F28 Tailwind tidak terpakai | Selesai di kode | Import dan dependensi yang tidak digunakan sudah dihapus. |
| F29 auth hardening | Parsial | Limit per akun ditambah dan enumerasi registrasi ditutup; trusted proxy masih perlu diperkeras. |
| F30 health detail | Selesai di kode | Endpoint publik hanya mengembalikan status. |
| F31 sample Shopee | Menunggu ops | Harus dibuktikan request TAP sampai ke alur brand yang benar. |
| F32 campaign picker | Selesai di kode | Input memakai pencarian datalist, bukan select ratusan opsi. |
| F33 freshness claim | Belum | Indikator hijau perlu last-verified yang nyata. |

## Launch gates yang dapat diuji ulang

1. `npm run qa` hijau tanpa jaringan eksternal.
2. Smoke sumber live berjalan terpisah dan melaporkan record invalid tanpa menerbitkannya.
3. Production tidak menampilkan PURBASARI atau brand lain dengan rate ambigu.
4. Glow Better tidak menampilkan `+12% extra` dan tidak berada di urutan pertama.
5. Kartu pertama terlihat pada viewport Pixel 7 tanpa dua layar pengantar.
6. Tim ops mengonfirmasi pemilik, SLA, dan delivery request sample Shopee.
7. Domain production mengisi `NEXT_PUBLIC_SITE_URL=https://tap.haluandigital.agency` sebelum perpindahan DNS.

## Bukti gate putaran 2

- `npm run qa`: lint hijau, 6/6 unit test, 0 kerentanan dependency, build hijau, 34/34 E2E mobile + desktop hijau.
- `npm run audit:rates`: 310 record diterbitkan; 50 sel pada 35 brand ditahan untuk perbaikan ops.
- E2E memverifikasi HTML server berisi nama brand, homepage tidak memanggil API katalog di browser, dan katalog kedua baru dimuat saat tab platform dipilih.
- E2E memverifikasi Google sign-in tampil saat credential OAuth tersedia dan audit membership langsung dapat dibaca admin.

## Remediasi audit putaran 3

Audit independen commit `f92c1fe` memberi skor 7,6/10 dan menemukan T1–T6. Status setelah remediasi kode:

- **T1 selesai:** theme toggle mobile kembali `fixed` dengan stacking context sendiri; media kartu tidak menerima pointer event; focus restoration modal tidak lagi mencuri fokus yang baru dipindahkan pengguna. Bukti deterministik: 10/10 pengulangan tes shortcut dan lima `npm run qa` berurutan hijau, masing-masing 36/36 E2E.
- **T2 selesai:** rate limiter endpoint katalog publik fail-open saat Redis bermasalah. Tes mematikan mock Redis dan tetap memperoleh katalog HTTP 200; auth dan write routes tidak diubah dan tetap fail-closed.
- **T3 selesai:** campaign sample hanya dapat dikirim bila input cocok dengan opsi terstruktur. Teks bebas ditolak sebelum request dengan error inline yang terhubung melalui `aria-describedby`.
- **T4 selesai:** posisi kartu homepage diuji terhadap tinggi viewport dikurangi 64px bottom navigation, bukan sekadar tinggi viewport penuh.
- **T5 parsial:** aset Mistine, Laneige, dan Anua yang sudah tersedia kini dipakai sebagai logo. Kelengkapan katalog tetap pekerjaan aset dan tidak dinyatakan selesai.
- **T6 selesai:** deklarasi `revalidate` yang tidak berlaku pada route dinamis `/deals` dihapus.
- **F20 selesai:** headline outline desktop diganti warna cyan solid; pesan utama tidak lagi bergantung pada `-webkit-text-stroke`.

Temuan yang tetap terbuka: F10 verifikasi/reset email, F15 pagination PII admin, F31 kepastian intake sample Shopee, dan penyelesaian aset logo T5.

## Keputusan board sementara

- **Internal/closed beta:** go, setelah deploy remediation dan smoke production lulus.
- **Ads untuk creator baru:** no-go sampai F1–F3 terverifikasi di production dan F31 dikonfirmasi.
- **Klaim 10/10:** tidak boleh dipakai. Nilai baru hanya diterbitkan setelah seluruh bukti launch gate direkam ulang.
