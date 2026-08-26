# Gambar hero

`HeroVisual` mencari berkas ini dan memakainya begitu ada:

- `creator-mascot.png`

Ekstensi yang diterima, sesuai urutan pencarian: `.png`, `.webp`, `.avif`, `.jpg`.

Dirender selebar 340px di desktop dan 300px di layar kecil, dengan rasio 620x760.
Simpan pada ukuran sekitar dua kali itu agar tajam di layar retina; Next.js yang
mengubahnya ke WebP atau AVIF saat disajikan. Latar transparan lebih baik, karena
gambarnya tampil di atas tema terang maupun gelap.

Selama berkasnya belum ada, kolom kanan hero kembali memakai panel "Tersedia di"
berisi jumlah brand TikTok Shop dan Shopee. Jadi tidak ada gambar rusak, dan tidak
ada ruang kosong.

Gambarnya dianggap dekoratif: `alt` sengaja dikosongkan karena TikTok Shop dan
Shopee sudah disebut sebagai teks di headline dan proof bar. Kalau nanti gambarnya
membawa informasi yang tidak ada di teks mana pun, `alt`-nya harus diisi.

Catatan aset: ikon dan maskot 3D bergaya bukan press asset resmi TikTok atau
Shopee. Bila memakai gambar semacam itu, catat asalnya di `BRAND-LOGO-SOURCES.md`
supaya aturan sumber logo dan kenyataannya tetap sejalan.
