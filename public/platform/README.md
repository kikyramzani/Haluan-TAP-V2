# Ikon platform

`PlatformPanel` di halaman depan mencari berkas berikut dan memakainya bila ada:

- `tiktok.png`
- `shopee.png`

Ekstensi yang diterima, sesuai urutan pencarian: `.png`, `.webp`, `.svg`, `.jpg`.
Ukuran render 44x44, jadi 88x88 atau 132x132 sudah cukup untuk layar retina.

Selama berkasnya belum ada, panel tetap tampil memakai inisial "TT" dan "SH".
Tidak ada gambar rusak dan tidak ada layout yang bergeser saat berkasnya masuk.

Catatan aset: ikon 3D bergaya bukan press asset resmi TikTok atau Shopee, jadi
pilihan itu ada di luar aturan sumber resmi di `BRAND-LOGO-SOURCES.md`. Kalau
ikon semacam itu yang dipakai, catat asalnya di berkas tersebut supaya aturan
dan kenyataan tetap sejalan.
