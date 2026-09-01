# Gambar hero

`HeroVisual` mencari berkas ini dan memakainya begitu ada:

- `creator-mascot.png`

Ekstensi yang diterima, sesuai urutan pencarian: `.png`, `.webp`, `.avif`, `.jpg`.

Dirender selebar **420px di desktop**, dan di bawah 900px selebar `min(360px, 78vw)`
dengan **tinggi dibatasi 28vh**. Berkas yang ada sekarang 944x823 (lanskap), jadi di
ponsel 390px ia tampil ~272x236.

Simpan pada ukuran sekitar dua kali lebar render (±840px) agar tajam di layar
retina; Next.js yang mengubahnya ke WebP atau AVIF saat disajikan. Latar transparan
lebih baik, karena gambarnya tampil di atas tema terang maupun gelap.

**Sisakan ruang di tepi bawah gambar.** Berkas yang ada sekarang menaruh objeknya
mepet ke tepi bawah kanvas, dan itu terbaca seperti terpotong walau CSS tidak
memotong apa pun. Batas tinggi 28vh dipasang justru supaya seluruh gambar muat di
atas bottom nav pada ponsel biasa (diukur: 390x844, 430x932, 768x1024 semuanya muat).

Pada layar yang lebih pendek dari 720px gambarnya **disembunyikan sepenuhnya** —
di sana tumpukan teks hero saja sudah menyisakan ~31px, dan menampilkan sesobek
gambar yang tertimpa nav lebih buruk daripada tidak menampilkannya. Aman karena
gambarnya dekoratif.

Selama berkasnya belum ada, kolom kanan hero kembali memakai panel "Tersedia di"
berisi jumlah brand TikTok Shop dan Shopee. Jadi tidak ada gambar rusak, dan tidak
ada ruang kosong.

Gambarnya dianggap dekoratif: `alt` sengaja dikosongkan karena TikTok Shop dan
Shopee sudah disebut sebagai teks di headline dan proof bar. Kalau nanti gambarnya
membawa informasi yang tidak ada di teks mana pun, `alt`-nya harus diisi.

Catatan aset: ikon dan maskot 3D bergaya bukan press asset resmi TikTok atau
Shopee. Bila memakai gambar semacam itu, catat asalnya di `BRAND-LOGO-SOURCES.md`
supaya aturan sumber logo dan kenyataannya tetap sejalan.
