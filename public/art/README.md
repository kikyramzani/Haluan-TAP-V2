# Ilustrasi halaman publik

Folder ini adalah slot aset. `lib/art-slot.ts` mencari berkas di sini saat render;
selama berkasnya belum ada, halaman memakai vektor SVG bawaan
(`app/components/Illustration.tsx`) — jadi tidak pernah ada gambar rusak dan tidak
pernah ada ruang kosong.

Menaruh berkas di sini **tidak butuh perubahan kode**.

## Berkas yang dicari

| Nama berkas | Dipakai di | Vektor pengganti sementara |
|---|---|---|
| `join-banner` | Banner ajakan bergabung di beranda | `scene="join"` |
| `sample-box` | Kolom kiri halaman Request sample | `scene="sample"` |
| `kenapa-lead` | Kartu unggulan seksi "Kenapa lewat TAP" di beranda | `scene="exclusive"` |

Ekstensi yang diterima, sesuai urutan pencarian: `.png`, `.webp`, `.avif`, `.jpg`.
Contoh: `join-banner.png`.

## Ukuran

Keduanya dirender selebar ~420px di desktop dan ~80% lebar layar di ponsel.
Simpan sekitar dua kali itu (±840px) agar tajam di layar retina; Next.js yang
mengubahnya ke WebP atau AVIF saat disajikan.

**Latar transparan lebih baik.** `join-banner` tampil di atas gradasi magenta,
`kenapa-lead` di atas isian magenta solid, dan `sample-box` di atas permukaan yang
berbeda antara tema terang dan gelap —
latar putih solid akan terlihat sebagai kotak yang menempel.

## Batasan yang harus dipatuhi

- **`join-banner` dan `kenapa-lead` tidak boleh membawa gradasi sendiri.** BRAND-SYSTEM.md §3.4
  membatasi satu gradasi Haluan Hot per viewport, dan jatah itu sudah dipakai
  latar banner-nya. Ilustrasi di atasnya harus datar atau bergaris.
- Gambar di sini dianggap **dekoratif**: `alt`-nya sengaja kosong karena isinya
  selalu sudah dinyatakan sebagai teks di judul dan paragraf di sebelahnya. Kalau
  gambarnya nanti membawa informasi yang tidak ada di teks mana pun, `alt`-nya
  harus diisi lewat prop `alt` pada `<ArtSlot>`.
- Logo brand pihak ketiga tidak boleh diberi tint atau overlay warna Haluan
  (BRAND-SYSTEM.md §7).
