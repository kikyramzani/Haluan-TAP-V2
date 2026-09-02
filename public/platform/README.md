# Ikon platform

**Folder ini sudah tidak dibaca oleh kode mana pun.**

Dulu `PlatformPanel` memeriksa keberadaan `tiktok.png` / `shopee.png` di sini dengan `existsSync` dan jatuh ke inisial "TT"/"SH" bila berkasnya belum ada. Berkasnya memang tidak pernah masuk, jadi panelnya selalu menampilkan inisial.

Tandanya sekarang ada di dalam repo sebagai SVG monokrom inline di `app/components/PlatformMark.tsx`, dengan sumbernya tercatat di `BRAND-LOGO-SOURCES.md`. Inline, bukan berkas, karena kartu platform aktif di `/deals` memaksa `color: #ffffff` pada ikonnya — dan warna dari CSS tidak bisa menembus batas dokumen sebuah `<img>`.

Menambahkan berkas ke folder ini tidak akan mengubah apa pun. Untuk menambah atau mengganti tanda platform, sunting `PlatformMark.tsx` dan catat sumbernya di `BRAND-LOGO-SOURCES.md`.
