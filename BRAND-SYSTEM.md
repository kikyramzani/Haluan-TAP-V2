# Brand System Haluan

Panduan brand untuk semua permukaan digital Haluan, termasuk TAP.

---

## 0. Sumber, ruang lingkup, dan urutan kebenaran

### Dari mana isi dokumen ini

Sumbernya satu: **Haluan Creator Universe — Creator Deck** (PDF, 30 halaman). Dua hal diambil dari sana secara langsung, bukan dikira-kira:

- **Warna** — diekstrak dari content stream PDF-nya, jadi setiap hex di §2.1 adalah nilai yang benar-benar dipakai di deck, lengkap dengan berapa kali muncul. Warna gradasi diambil dengan sampling piksel dari ekspor background slide.
- **Tipografi** — diambil dari tabel `/BaseFont` di dalam PDF, jadi daftar font di §4 adalah daftar yang benar-benar ter-embed.

### Yang TIDAK diambil dari deck

**Komposisi slide tidak dibaca.** Aturan layout, spasi, radius, elevasi, dan gerak di §5 **diturunkan dari sistem TAP yang sudah berjalan** (`app/styles/tokens.css`), bukan disalin dari deck. Jangan membaca dokumen ini sebagai instruksi "bikin UI-nya mirip slide".

Alasannya juga bukan sekadar keterbatasan: deck dibaca dalam hitungan detik per halaman dari jarak jauh, sedangkan TAP berisi tabel admin, form alamat bertingkat, dan katalog ratusan kartu. Geometri yang cocok untuk slide tidak otomatis cocok untuk produk.

### Haluan dan TAP bukan hal yang sama

- **Haluan Creator Universe** — sisi agency, bicara ke creator dan brand. Deck ini materinya.
- **TAP by Haluan** — produk katalog deal di repo ini. TAP mewarisi brand Haluan, tapi punya beban legibility yang deck tidak punya.

Konsekuensinya: warna dan huruf sama, tapi TAP boleh memakai gradasi lebih hemat dan ukuran display lebih kecil daripada deck. Itu bukan pelanggaran brand.

### Urutan kebenaran

```
BRAND-SYSTEM.md          ← dokumen ini. Sumber kebenaran brand.
  └─ app/styles/tokens.css   ← implementasi token.
       └─ STITCH-DESIGN-SPEC.md §2   ← cermin tokens.css untuk keperluan prompt.
```

Kalau ketiganya berbeda, yang menang dokumen ini.

### Status kepatuhan hari ini

**Sudah diterapkan (1 September 2026).** `tokens.css` kini memakai palet §2.1 dan tipografi §4 (Poppins + Open Sans, self-host). Blok Lampiran A sudah masuk kode dengan satu penyesuaian: warna brand core dipakai sebagai sumber dan token semantik menunjuk ke sana lewat `var()`, supaya `--brand-*` tidak jadi palet mati untuk kedua kalinya (§10).

Seluruh 21 pemeriksaan Lampiran B cocok dengan §2.5, dan suite e2e (179 tes, termasuk axe di kedua tema) hijau.

Yang belum: lihat §10.

---

## 1. Fondasi brand

### Posisi

Haluan memonetisasi creator, bukan memviralkan mereka. Deck-nya menyusun argumen itu dalam sepuluh bagian:

Vision → Our Achievement → The Pain → How It Works → One Universe, Many Ways to Earn → Why Join → China Trip → Showcase → Our Partners → Join the Universe.

Bentuknya jelas: klaim → bukti → masalah yang dirasakan creator → mekanisme → jalur penghasilan → alasan bergabung → bukti lagi → ajakan. Setiap klaim ditempelkan bukti sebelum ajakan muncul. Pola itu yang harus dipertahankan di landing page, bukan sekadar warnanya.

Tulang punggung argumennya, dalam bahasa deck sendiri: creator sudah punya audience besar tapi tetap sulit mengubah perhatian jadi penghasilan. Haluan menjual sistem yang menutup jarak itu — script, data insight, slot LIVE, akses campaign — bukan menjual eksposur.

### Personality

Empat sifat, dan masing-masing punya konsekuensi visual:

| Sifat | Artinya di layar |
|---|---|
| **Berani** | Magenta dipakai sebagai bidang penuh, bukan sekadar aksen 2px. Display type besar dan berat. |
| **Operator-led** | Angka ditampilkan apa adanya dengan label yang jelas, tanpa dekorasi grafik yang tidak menambah informasi. |
| **Proof-first** | Setiap klaim punya angka atau nama brand di dekatnya. Kalau tidak ada buktinya, klaimnya diturunkan. |
| **Praktis** | Tidak ada ilustrasi abstrak yang tidak menjelaskan apa pun. Kalau ada gambar, gambar itu bekerja. |

### Dua audience, dua nada

Dari `GENERAL-WRITING-COPY-STYLE.md` §6, dan ini juga berlaku ke visual:

- **Brand / business** — premium, ringkas, komersial. Lebih banyak ruang kosong, gradasi seperlunya, angka besar.
- **Creator** — langsung, energetik, tidak korporat. Boleh lebih padat, lebih berwarna, lebih banyak ikon.

TAP melayani creator. Jadi permukaan publik TAP condong ke nada kedua.

---

## 2. Warna

### 2.1 Brand core

Delapan warna. Semuanya diekstrak langsung dari deck; kolom terakhir adalah jumlah kemunculan di content stream PDF.

| Token | Hex | Peran | Muncul |
|---|---|---|---|
| `--brand-magenta` | `#FB007F` | Warna utama Haluan. Isian bidang, CTA, awal gradasi. | 60× |
| `--brand-magenta-deep` | `#EC008C` | Magenta sekunder. Titik tengah gradasi, state ditekan. | 24× |
| `--brand-magenta-bright` | `#FF209D` | Highlight. State hover, teks aksen di latar gelap. | 2× |
| `--brand-violet` | `#D226C7` | Bleed ungu di ujung gradasi. Tidak pernah berdiri sendiri. | sampling |
| `--brand-pink-tint` | `#FFD5EA` | Latar pill, chip, dan panel lembut. | 8× |
| `--brand-cyan` | `#00BEF3` | Aksen dingin penyeimbang. Lihat batasannya di §2.5. | 12× |
| `--brand-ink` | `#090A0A` | Hitam brand. Teks, latar tema gelap. | 24× |
| `--brand-paper` | `#FCFCFC` | Putih brand. Latar tema terang. | 50× |

Deck juga memakai `#0B0207` (14×), `#F9F9F9` (12×), dan `#FFFBFD` (2×). Ketiganya varian sangat dekat dari ink dan paper; dipakai sebagai permukaan turunan, bukan warna terpisah.

**Warna yang ada di deck tapi bukan warna Haluan:** `#FE2C55` dan `#25F4EE` (TikTok), `#FDDC02` dan `#D71800` (Shopee), `#1DB40F` (WhatsApp), `#B00C03`. Itu warna logo pihak ketiga. Jangan masukkan ke palet, jangan pakai untuk elemen Haluan.

### 2.2 Action ramp

`#FB007F` tidak bisa membawa label putih (3.88, gagal AA). Untuk kontrol yang wajib berlabel putih, dibutuhkan versi yang lebih gelap dari hue yang sama. Tiga langkah berikut diturunkan dari `#FB007F` — hue-nya sama, luminance-nya diturunkan sampai lolos:

| Token | Hex | Putih di atasnya |
|---|---|---|
| `--action` | `#D60069` | 5.17 |
| `--action-hover` | `#C90063` | 5.73 |
| `--action-press` | `#BE005E` | 6.27 |

Kapan memakai yang mana ada di §6.1. Ringkasnya: `#FB007F` + label ink untuk kontrol besar, action ramp + label putih untuk kontrol padat.

### 2.3 Netral dan permukaan

Skala permukaan `tokens.css` yang sekarang sudah benar bentuknya. Yang berubah hanya hue-nya: ink dan paper diganti nilai deck.

**Tema gelap**

| Token | Hex | Catatan |
|---|---|---|
| `--bg` | `#090A0A` | ink deck |
| `--surface` | `#0E0E13` | putih di atasnya 19.25 |
| `--surface-sunken` | `#060607` | |
| `--surface-raised` | `#14141B` | putih di atasnya 18.33 |
| `--line` | `rgba(255,255,255,0.10)` | tidak berubah |
| `--line-strong` | `rgba(255,255,255,0.18)` | tidak berubah |

**Tema terang**

| Token | Hex | Catatan |
|---|---|---|
| `--bg` | `#FCFCFC` | paper deck |
| `--surface` | `#FFFFFF` | |
| `--surface-sunken` | `#F9F9F9` | varian paper deck |
| `--surface-raised` | `#FFFFFF` | |
| `--line` | `rgba(9,10,10,0.12)` | |
| `--line-strong` | `rgba(9,10,10,0.20)` | |

Teks di tema terang: `--text: #090A0A` (19.32 di atas paper), `--text-muted: #4A4A55` (8.52), `--text-subtle: #63636E` (5.78). Ketiganya lolos AA di seluruh permukaan terang di atas.

Perubahan yang perlu dicatat: tema terang sekarang memakai `--surface-sunken: #f4f3f0`, krem warisan hcommerce. Nilai itu tidak ada di deck Haluan dan diganti `#F9F9F9`.

### 2.4 Status dan platform

**Tidak diubah.** Warna status (`--positive`, `--warning`, `--danger`) dan aksen platform (`--platform-tiktok`, `--platform-shopee`, `--platform-shopee-solid`) di `tokens.css` sudah dipilih dengan alasan kontras yang tertulis di komentarnya, dan tidak satu pun bertabrakan dengan magenta brand.

Satu catatan yang perlu dipertahankan: aksen platform di TAP sengaja **bukan** warna asli TikTok/Shopee. Komentar di `tokens.css:76-81` sudah menjelaskan alasannya — pink dan cyan asli TikTok nyaris sama dengan warna aksi milik situs sendiri, jadi kartu TikTok akan terbaca seperti kartu ber-state aktif alih-alih penanda platform. Setelah `--cta` jadi `#FB007F`, alasan itu makin kuat, bukan makin lemah.

### 2.5 Aturan kontras

Semua angka di bawah dihitung dengan WCAG 2.1 relative luminance. Skrip untuk memverifikasi ulang ada di Lampiran B.

| Kombinasi | Rasio | Putusan |
|---|---|---|
| Putih di `#FB007F` | **3.88** | **Gagal** AA teks normal. Lolos hanya untuk teks ≥24px atau ≥19px bold. |
| Ink `#090A0A` di `#FB007F` | **5.10** | Lolos AA |
| Ink di `#EC008C` | 4.67 | Lolos AA |
| Ink di `#FF209D` | 5.61 | Lolos AA |
| Ink di `#D226C7` | 4.57 | Lolos AA |
| Putih di `#D226C7` | 4.34 | Gagal AA teks normal |
| Ink di `#FFD5EA` | 15.06 | Aman |
| `#00BEF3` di ink | 9.12 | Lolos |
| `#00BEF3` di paper `#FCFCFC` | **2.12** | **Gagal telak** |
| `#FF209D` di `#0E0E13` | 5.45 | Lolos — magenta boleh jadi teks di tema gelap |
| `#C90063` di paper | 5.59 | Lolos — magenta gelap boleh jadi teks di tema terang |

Dari tabel itu lahir empat aturan yang tidak boleh dilanggar:

1. **`#FB007F` tidak pernah membawa teks putih.** Label di atasnya ink. Kalau label harus putih, ganti isiannya ke action ramp §2.2.
2. **Cyan `#00BEF3` hanya untuk tema gelap.** Di tema terang cyan tidak pernah membawa teks — hanya boleh jadi bidang atau garis. Kalau tema terang butuh aksen dingin yang membawa teks, pakai `#046B87` (5.92 di atas paper).
3. **`#FFD5EA` hanya latar, tidak pernah teks.** Kontrasnya di atas paper hanya 1.32.
4. **`#D226C7` tidak pernah berdiri sendiri sebagai isian berlabel.** Ia titik akhir gradasi, bukan warna kontrol.

---

## 3. Gradasi

Dua resep. Keduanya berlabel **ink**, dan itu perbedaan paling penting dari gradasi yang ada di kode sekarang.

### 3.1 Haluan Hot

```css
--gradient-hot: linear-gradient(135deg, #FB007F 0%, #EC008C 50%, #D226C7 100%);
```

Titik terburuk untuk label ink adalah ujung violet: **4.57**. Artinya ink aman di sepanjang sapuan. Putih tidak — di ujung violet putih hanya 4.34 dan di pangkal magenta 3.88.

Untuk: banner hero, join banner, kartu promo besar, isian CTA besar.

### 3.2 Haluan Soft

```css
--gradient-soft: linear-gradient(160deg, #FFFAFD 0%, #FFE1F3 38%, #FEC2E5 72%, #F585EC 100%);
```

Diambil dari band bawah background deck. Titik terburuk untuk ink: **8.92** di ujung `#F585EC`. Sangat lapang.

Untuk: latar section, panel kosong, header halaman di tema terang. Bukan untuk kontrol — tombol dengan latar sepucat ini kehilangan bentuknya.

### 3.3 Wash

```css
--gradient-wash: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, #FB007F 12%, transparent) 0%, transparent 62%);
```

Bentuknya dipertahankan dari yang sudah ada di `tokens.css`, hanya hue-nya diganti ke magenta brand. Ini sapuan sudut kartu, tidak pernah membawa teks langsung.

### 3.4 Aturan gradasi

- **Label di gradasi Haluan selalu ink.** Ini kebalikan dari `--gradient-cta` yang sekarang, yang berakhir di `#8B1A9E` — di sana ink cuma 2.59 dan putih 7.67, jadi gradasi lama itu white-safe. Dua sistem yang berlawanan. **Jangan pernah mencampurnya**; kalau `--gradient-hot` masuk, `--gradient-cta` lama harus keluar bersamaan, bukan bertahap.
- Gradasi tidak pernah berada di bawah teks ≤14px. Untuk teks kecil, pakai isian solid.
- Tidak ada dua bidang bergradasi yang bersentuhan. Selalu ada permukaan solid di antaranya.
- Maksimal satu Haluan Hot per viewport. Kalau ada dua, salah satunya bukan yang utama dan harus turun jadi solid.
- **Logo TIDAK dihitung.** Gradasi pada kata "TAP" di Logo Haluan TAP berada di luar tiga aturan di atas: ia tidak menghabiskan jatah satu-per-viewport, boleh bersentuhan dengan bidang bergradasi lain, dan boleh berada pada ukuran teks kecil. Alasannya bukan kelonggaran, melainkan perbedaan peran. Aturan-aturan itu ada untuk mencegah gradasi SALING BERSAING memperebutkan perhatian di antara kontrol. Logo tidak ikut lomba itu: ia identitas yang justru harus tampil sama persis di setiap halaman, dan orang berhenti "melihat"-nya setelah kunjungan kedua. Yang tetap mengikat logo: gradasinya dua perhentian dalam rona bertetangga, dan tidak pernah diletakkan di atas bidang bergradasi lain.
- Gradasi tidak dianimasikan. Sapuan yang bergerak menarik perhatian ke arah yang tidak membawa informasi.

---

## 4. Tipografi

### 4.1 Apa yang dipakai deck, dan apa yang dipakai web

Deck meng-embed sembilan family: Agrandir (Wide Heavy / Wide Bold / Wide Medium), Telegraf (Regular → UltraBold), Garet (Regular / Bold), CodecPro Bold, CyGrotesk Key Heavy, Poppins (Regular / Bold / Bold Italic), Open Sans Regular.

Enam yang pertama berlisensi komersial lewat Canva, tidak terinstal di mesin manapun di proyek ini, dan tidak dibeli. Yang tersisa dan bisa dipakai bebas: **Poppins** dan **Open Sans**, keduanya OFL, keduanya memang sudah ada di deck.

**Keputusan: web memakai Poppins + Open Sans.**

### 4.2 Apa yang hilang karena keputusan itu

Display type deck adalah Agrandir **Wide** Heavy — ekstended dan sangat berat. Poppins geometris dengan lebar normal. **Karakter "lebar" itu hilang dan tidak bisa dikembalikan.** Ini konsekuensi nyata, bukan detail.

Yang boleh dilakukan untuk mengompensasi:

- Naikkan bobot: display selalu 700, tidak pernah 600.
- Naikkan ukuran: display di Haluan boleh satu langkah lebih besar dari default TAP sekarang.
- Rapatkan tracking pada ukuran besar (`-0.03em`), karena Poppins geometris terasa renggang di ukuran display.
- Untuk eyebrow dan label kecil, pakai uppercase dengan tracking longgar (`0.08em`). Poppins uppercase butuh lebih banyak ruang daripada Archivo.

Yang **dilarang**:

- `transform: scaleX()` untuk memalsukan lebar. Menghasilkan stroke yang tidak konsisten antara vertikal dan horizontal.
- `font-stretch`. Poppins tidak punya width axis, jadi properti ini tidak berefek — kecuali browser memalsukannya, yang hasilnya sama buruknya.
- `-webkit-text-stroke` untuk menambah berat. Bikin sudut huruf tumpul.
- Open Sans Variable punya axis `wdth`, tapi rentangnya 75–100 — hanya bisa lebih **sempit**, tidak bisa lebih lebar. Tidak membantu.

### 4.3 Peta peran

| Peran | Family | Bobot | Tracking |
|---|---|---|---|
| Display (hero, angka besar) | Poppins | 700 | `-0.03em` |
| H1 | Poppins | 700 | `-0.03em` |
| H2 | Poppins | 600 | `-0.015em` |
| H3 | Poppins | 600 | `-0.015em` |
| Eyebrow / label section | Poppins | 600, uppercase | `0.08em` |
| Body, lead | Open Sans | 400 | 0 |
| Label UI, tombol, chip | Open Sans | 600 | 0 |
| Tabel, angka data | Open Sans | 400 / 600 | 0, `font-variant-numeric: tabular-nums` |
| Caption, helper | Open Sans | 400 | 0 |

Aturan lama di `base.css` — h1 memakai display font sementara h2–h4 memakai body font karena tumpukan heading display bersaing di mobile — lahir di masa Archivo.

**Sudah dicek di layar dan dugaan di atas benar:** dibandingkan langsung pada 390px di bagian "Tiga langkah" (satu h2 diikuti tiga h3), Poppins 600 tidak menebal seperti Archivo dan headingnya terbaca lebih jelas sebagai suara brand. **h2 dan h3 kini memakai Poppins; h4 tetap di font isi** karena ia dipakai sebagai label di kartu dan tabel, bukan judul bagian.

### 4.4 Bobot: satu koreksi yang wajib

`tokens.css` sekarang memakai `--weight-medium: 550`, `--weight-semibold: 650`, `--weight-display: 750`. Angka non-standar itu hanya berfungsi kalau font-nya variable.

**Poppins di Google Fonts tidak variable** — ia dikirim sebagai bobot statis 100–900 kelipatan 100. Bobot 550/650/750 akan dibulatkan oleh browser dan hasilnya tidak bisa diprediksi antar mesin.

Kalau Poppins masuk, bobotnya harus jadi:

```css
--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-display: 700;
```

Open Sans memang variable (wght 300–800), tapi karena keduanya dipakai berdampingan, skala bobotnya disamakan ke angka standar supaya tidak ada dua sistem berbeda.

### 4.5 Self-host

Ikuti pola yang sudah ada: `@font-face` langsung di `tokens.css`, file di `public/`, `font-display: swap`, tanpa `next/font`.

- `public/poppins-600.woff2`, `public/poppins-700.woff2`
- `public/open-sans.woff2` (variable, wght 400–600 di-subset)

Subset latin + latin-ext. Poppins 400 tidak perlu diunduh — Poppins hanya dipakai untuk heading, dan tidak ada heading berbobot 400.

**Trade-off yang harus disadari.** `--font-body` sekarang sengaja menaruh `-apple-system` di depan supaya Inter tidak pernah diunduh di iOS dan macOS. Menaruh Open Sans di depan membatalkan penghematan itu — sekitar 20–30 KB tambahan di perangkat Apple. Rekomendasi tetap menaruh Open Sans di depan, karena konsistensi huruf adalah inti dokumen ini dan SF Pro terlihat jelas berbeda dari Open Sans. Kalau performa lebih diutamakan, keputusan ini boleh dibalik, asal dibalik secara sadar dan dicatat di sini.

```css
--font-display: Poppins, system-ui, sans-serif;
--font-body: "Open Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
```

### 4.6 Skala

Tidak berubah dari `tokens.css`. Skalanya sudah proporsional dan sudah teruji di breakpoint yang ada.

```css
--text-display: clamp(40px, 6vw, 76px);
--text-h1: clamp(32px, 4.2vw, 52px);
--text-h2: clamp(25px, 2.6vw, 34px);
--text-h3: clamp(19px, 1.5vw, 22px);
--text-lead: 18px;
--text-body: 16px;
--text-sm: 14px;
--text-xs: 12px;
```

---

## 5. Spasi, radius, elevasi, gerak

**Brand tidak mengubah geometri.** Yang berubah karena brand hanyalah warna dan huruf. Seluruh nilai di bawah diambil apa adanya dari `app/styles/tokens.css` dan dikunci di sini supaya tidak ada yang menciptakan skala kedua.

**Spasi** — kelipatan 4, dengan dua langkah setengah khusus padding badge dan chip:

```
--space-half 2  --space-1 4  --space-1-5 6  --space-2 8  --space-3 12
--space-4 16  --space-6 24  --space-8 32  --space-12 48  --space-16 64
--space-20 80  --space-24 96  --space-32 128
--space-section clamp(56px, 4vw + 40px, 112px)
```

**Radius** — pil hanya untuk badge dan kontrol ringkas:

```
--radius-sm 8  --radius-md 12  --radius-lg 16
--radius-xl 20  --radius-2xl 24  --radius-pill 999
```

**Ikon** — `--icon-sm 16`, `--icon-md 20`, `--icon-lg 24`, `--icon-xl 28`. Disetel lewat `font-size`, bukan prop `size`, karena Phosphor default-nya `1em`.

**Layout** — `--shell-width 1180px`, `--header-height 64px`, `--bottom-nav-height 64px`, `--bottom-nav-inset` sudah termasuk `env(safe-area-inset-bottom)`.

**Bayangan** — empat langkah, ditulis ulang per tema (bukan dibalik). `--shadow-card` sengaja terpisah dari `--shadow-md` karena kartu deal hanya naik 2px saat hover.

**Gerak** — `--duration-fast 150ms`, `--duration-normal 250ms`, `--duration-slow 350ms`, `--ease-out cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in-out cubic-bezier(0.4, 0, 0.2, 1)`.

Aturan gerak yang bersifat brand:

- Hanya `transform`, `opacity`, dan `filter` yang dianimasikan. Tidak pernah `width`, `height`, `top`, `left`, atau `background-position`.
- Gradasi tidak bergerak (§3.4).
- Semua gerak dekoratif hormat pada `prefers-reduced-motion`. `app/components/Parallax.tsx` sudah menjadi contohnya.

**Breakpoint** — perlu dinormalisasi. `STITCH-DESIGN-SPEC.md` §6.5 menyebut 320 / 375 / 768 / 1024 / 1440, tapi CSS-nya sebenarnya memakai campuran `900px` (12×), `600px` (6×), `768px` (3×), `720px` (3×), `760px` (2×), `380px` (1×), dan `1100px` (1×) — tujuh ambang untuk lima yang didokumentasikan. Ini bukan masalah brand, tapi harus diberesi sebelum restyling, kalau tidak setiap perbaikan visual akan dikerjakan dua kali.

---

## 6. Aturan per komponen

Bagian ini hanya menyebut apa yang **berubah** di lapisan brand. Struktur, markup, dan perilaku komponen sudah didokumentasikan di `STITCH-DESIGN-SPEC.md` §3 dan tidak diulang di sini.

### 6.1 Tombol

Ini keputusan brand yang paling terlihat dan paling penting.

**Primary besar — isian `#FB007F`, label ink `#090A0A` (5.10).**

Bukan magenta gelap berlabel putih. Hot pink dengan label hitam adalah tanda tangan visual deck, dan ia lolos AA dengan selisih lebih lebar daripada versi putih manapun. Ini yang memberi brand karakter, bukan sekadar "pink lagi".

Berlaku untuk: CTA hero, join banner, submit form, tombol utama kartu deal — semua yang labelnya ≥15px.

| State | Isian | Label | Rasio |
|---|---|---|---|
| Default | `#FB007F` | `#090A0A` | 5.10 |
| Hover | `#FF209D` | `#090A0A` | 5.61 |
| Press | `#EC008C` | `#090A0A` | 4.67 |

Perhatikan arahnya: hover **menyala lebih terang**, press **turun lebih dalam**. Kebalikan dari gradasi lama yang selalu menggelap.

**Primary padat — isian `#D60069`, label putih (5.17).**

Untuk kontrol berlabel ≤14px: aksi di baris tabel admin, tombol di dalam filter bar, aksi sekunder di sheet. Pada ukuran itu hot pink dengan label hitam mulai terbaca seperti stabilo, bukan tombol.

Hover `#C90063` (5.73), press `#BE005E` (6.27).

**Aturan pemilihan, satu kalimat:** label ≥15px → hot pink + ink. Label ≤14px → action ramp + putih. Tidak ada wilayah abu-abu.

**Secondary** — transparan, `1px solid var(--line-strong)`, label `var(--text)`. Tidak berwarna brand. Kalau semua tombol berwarna, tidak ada yang utama.

**Ghost** — hanya label `var(--text-muted)`, tanpa border. Hover menaikkan ke `var(--text)`.

**Focus ring butuh token sendiri.**

Ini konsekuensi yang mudah terlewat. `forms.css:67-73` menurunkan focus ring dari `--accent`. Di palet lama `--accent` adalah cyan, jadi aman. Di palet ini `--accent` menjadi magenta di tema terang — dan ring magenta di atas tombol magenta praktis tidak terlihat.

Jadi focus ring dilepas dari `--accent` dan dapat token sendiri. Syaratnya berat: WCAG 1.4.11 menuntut ring kontras ≥3.0 terhadap **dua** hal sekaligus — komponen yang di-fokus dan latar di sekelilingnya. Tidak ada satu pun warna brand yang lolos keduanya di atas tombol `#FB007F`. Cyan hanya 1.79 terhadap tombol; `#046B87` hanya 1.56.

Yang lolos hanya netral ekstrem:

| Tema | `--focus-ring` | vs tombol `#FB007F` | vs latar halaman |
|---|---|---|---|
| Terang | `#090A0A` | 5.10 | 19.32 |
| Gelap | `#FFFFFF` | 3.88 | 19.82 |

Ring memakai `outline` dengan `outline-offset: 2px`, bukan `box-shadow` menempel, supaya ia duduk di latar halaman dan tidak tertelan isian tombol.

### 6.2 Badge dan chip

Badge tetap pil bertint lembut, **bukan** bergradasi. Empat badge popularitas (`badge-hot-top-brand`, `badge-hot-trending`, `badge-hot-high-conversion`, `badge-hot-high-demand`) sudah benar bentuknya di `app/components/HotBadge.tsx`.

Yang berubah: badge yang bersifat brand — bukan status, bukan platform — memakai `#FFD5EA` sebagai latar dengan label ink (15.06). Badge status tetap memakai warna statusnya sendiri.

Chip aktif tetap inversi (`background: var(--text)`, `color: var(--bg)`), tidak diganti magenta. Alasannya: chip filter bisa aktif banyak sekaligus, dan lima chip magenta berjajar akan bersaing dengan CTA di layar yang sama.

### 6.3 Kartu

`--gradient-wash` retinted ke magenta brand (§3.3) tetap dipakai sebagai sapuan sudut. Border, radius, dan `--shadow-card` tidak berubah.

Logo brand pihak ketiga di `public/brand-logos/` dan `public/brand-media/` **tidak pernah diberi tint, overlay, atau filter warna brand Haluan.** Logo mereka milik mereka. Yang boleh: latar netral di belakangnya, dan radius container.

### 6.4 Navigasi

Header dan bottom nav tetap memakai permukaan netral dengan `backdrop-filter`, bukan bidang magenta. Nav berwarna penuh akan bersaing dengan CTA di setiap halaman.

State aktif di bottom nav sekarang memakai pil `var(--accent-soft)` di belakang ikon. Dengan palet baru, `--accent-soft` di tema terang menjadi `#FFD5EA`, dan itu justru lebih tepat — pil pink lembut di belakang ikon aktif, label `var(--accent)`.

`app/admin/(dashboard)/AdminNav.tsx` masih memakai glyph Unicode (`▦ ◎ ⌁ ▧ ∞ ◐ ☺ + △ ◆ ▤ ⇩`) sementara seluruh aplikasi lain sudah pindah ke Phosphor lewat `app/components/Icon.tsx`. Itu penyimpangan brand yang terlihat, dan harus diseragamkan.

### 6.5 Form

Tidak ada perubahan geometri: label di atas field, tinggi field 44px, radius `--radius-sm` (8px).

Catatan drift: `STITCH-DESIGN-SPEC.md` §3.10 menyebut radius field 12px, tapi `forms.css:55` sebenarnya memakai `--radius-sm` alias 8px. Yang benar 8px. Ini salah satu titik di mana spec sudah melenceng dari kode, dan perlu diluruskan bersamaan dengan §10.

Yang berubah hanya submit button, mengikuti §6.1, dan focus ring, yang kini punya token sendiri — juga §6.1.

Field dalam keadaan error tetap memakai `--danger`, tidak pernah magenta. Magenta adalah warna aksi di sistem ini; memakainya untuk error membuat dua makna bertabrakan.

### 6.6 Tabel dan permukaan admin

Admin memakai varian padat di seluruhnya: action ramp `#D60069` + label putih, tidak ada gradasi, tidak ada display type. Admin adalah alat kerja, dan brand di sana hadir lewat huruf serta warna aksi, bukan lewat bidang berwarna.

Angka di tabel memakai `font-variant-numeric: tabular-nums` supaya kolom sejajar.

### 6.7 Empty state

Latar `--gradient-soft` (§3.2) dengan teks ink. Ini salah satu dari sedikit tempat gradasi lembut benar-benar berguna: ia mengisi ruang kosong tanpa menambah elemen yang harus dibaca.

---

## 7. Logo, ikon, imagery

### Logo Haluan TAP

TAP punya logonya sendiri, bukan wordmark korporat induk yang ditempeli badge. Sumbernya `app/components/BrandLogo.tsx`, dan seluruh asetnya dihasilkan `scripts/build-brand.mjs`.

**Wordmark.** Satu baris, "haluan tap", **seluruhnya huruf kecil**, Poppins 700 dijadikan outline. Huruf kecil mengikuti kesan Upwork dan Fiverr: keduanya wordmark huruf kecil yang membulat dan ramah, tanpa marka terpisah. Outline, bukan teks hidup: sebuah logo tidak boleh berubah bentuk kalau webfont gagal dimuat.

Detail khasnya ada pada huruf **t** di kata "tap": palangnya memanjang ke kiri dan kanan, menembus kedua sisinya. Huruf "a" kecil berbentuk lingkaran bertangkai, jadi palang yang dulu menembus kedua kaki huruf A kapital tidak punya tempat di sana, dan menembus lingkaran "a" justru membuatnya terbaca seperti "e". Huruf "t" sudah punya palang sejak awal, jadi memanjangkannya adalah gerak yang sama pada satu-satunya huruf yang tidak kehilangan apa pun karenanya.

- **Dua perlakuan, dua sumber.** "Haluan" memakai `currentColor` sehingga mengikuti tinta halaman. "TAP" membawa gradasi magenta ke violet yang SAMA dengan marka aplikasinya, lewat `--wordmark-from` dan `--wordmark-to`.
- **Gradasinya berpasangan per tema**, bukan satu nilai. Kedua ujung `--gradient-hot` gagal AA sebagai teks di atas paper: kontras bersifat simetris, jadi `#fb007f` yang hanya 3,78 di bawah teks putih juga hanya 3,78 sebagai teks di atas putih, dan `#d226c7` hanya 4,23. Pasangan terang `#c90063` → `#9430c4` (5,59 dan 5,88 di atas paper); pasangan gelap `#ff209d` → `#b46ff5` (5,45 dan 5,99 di atas `#0e0e13`). Jarak rona-nya sekitar 55 derajat, karena versi 25 derajat pertama praktis tidak terlihat pada wordmark setinggi 30px.
- **Gradasinya diberikan ke satu bidang persegi yang dipotong bentuk huruf**, bukan ke tiap huruf. Tiap glyph punya `transform` sendiri, dan transform membuat ruang koordinat baru, jadi gradasi yang menempel pada glyph ikut tergeser dan setiap huruf menyapu sendiri-sendiri. Terukur: ketiganya keluar dengan warna yang sama persis.
- **Clear space** minimal setinggi huruf "H" di keempat sisi.
- **Tinggi minimum** 26px di layar. Angkanya naik dari 22px karena kotak huruf kecil jauh lebih tinggi daripada kapital: ascender "h" dan "l" naik sampai -740 dan ekor "p" turun sampai +266, sementara x-height-nya hanya 558. Pada kotak yang sama, tinggi huruf yang benar-benar terlihat jadi jauh lebih kecil. Karena itu `.brand-logo` dirender 34px, bukan 30px.
- **Latar yang diizinkan**: paper, ink, permukaan netral. Tidak pernah di atas `--gradient-hot` — magenta di atas magenta.
- Tidak diregangkan, tidak dimiringkan, tidak diberi bayangan. `scaleX()` dan `font-stretch` dilarang §4.2; karena logonya outline, penskalaan proporsional memang satu-satunya yang mungkin.
- **Gradasi logo tidak dihitung dalam jatah §3.4.** Pengecualian itu ditulis di sana beserta alasannya. Yang tetap berlaku: dua perhentian saja, rona bertetangga, dan logo tidak pernah diletakkan di atas bidang bergradasi lain.

**Marka aplikasi.** Kata **"TAP"** kapital, satu baris, dengan gradasi `#fb007f` → `#d226c7` (kedua ujung `--gradient-hot`) menyapu melintasi ketiga hurufnya.

Kapital, bukan huruf kecil seperti wordmark-nya, dan itu keputusan teknis: kapital tidak punya ascender maupun descender, jadi pada kanvas persegi hurufnya bisa jauh lebih besar. Hurufnya juga ditebalkan lewat stroke yang mengikuti fill-nya sendiri — Poppins Bold adalah bobot terberat yang ada di repo ini, dan pada ukuran favicon ia masih terlalu ramping. Stroke yang sama sekaligus membulatkan sudutnya.

**Batas yang terukur, dan tidak bisa disetel habis.** Diukur pada kanvas 512 yang diperkecil ke ukuran render sebenarnya: dengan ketebalan awal, "TAP" baru terbaca mulai **32px**. Setelah tracking dan ketebalannya didorong sejauh mungkin, ia terbaca mulai **20px**. Di **16px ia tidak terbaca sebagai tiga huruf** — tinggi kapitalnya di sana hanya sekitar 5px. Itu batas nyata dari tiga huruf pada kanvas 16px. Di layar ber-DPI tinggi, tab browser umumnya meminta 32px, jadi dalam praktiknya sebagian besar pengguna melihat versi yang terbaca.

**Padding maskable berbeda, dan wajib berbeda.** Android memotong ikon maskable ke bentuk sistem dengan zona aman berupa lingkaran berdiameter 80% kanvas. Untuk kata selebar "TAP", persegi panjang terlebar yang muat di lingkaran itu hanya sekitar 382px pada kanvas 512, jadi paddingnya 66 — bukan 12 seperti favicon. Tanpa itu huruf T dan P terpotong di sudut.

| Berkas | Latar | Alasan |
|---|---|---|
| `favicon.svg`, `icon-192.png`, `icon-512.png` | transparan | browser menaruhnya di atas chrome-nya sendiri |
| `icon-maskable-512.png` | paper `#fcfcfc` | Android memotong maskable ke bentuk sistem |
| `apple-icon.png` | paper `#fcfcfc` | iOS tidak menangani transparansi ikon secara konsisten |
| `icon-badge-96.png` | transparan, satu warna | Android meratakan badge notifikasi jadi siluet |

`public/offline.html` memuat marka ini sebagai SVG **inline**. Halaman itu justru dipakai saat jaringan mati, jadi ia tidak boleh bergantung pada berkas yang harus diambil dari server. `scripts/build-brand.mjs` menulis ulang marka itu setiap kali dijalankan, karena salinan tangan pasti menyimpang dan tidak ada satu pun tes yang memeriksanya.

**`public/haluan-logo.png` tetap disimpan** sebagai wordmark korporat Haluan Digital Network, tetapi tidak lagi dirujuk kode mana pun. Ia identitas induk, bukan aset produk. Aturan lamanya — tidak diregangkan, tidak diganti warnanya — tetap berlaku kalau suatu saat ia dipakai lagi.

`public/og.jpg` (1200×630) tidak ikut berubah; lihat §10.

### Ikon

Satu keluarga: **Phosphor**, selalu lewat `app/components/Icon.tsx`. Tidak ada ikon dari sumber lain, tidak ada glyph Unicode, tidak ada emoji sebagai ikon UI.

Aturan teknisnya sudah tertulis lengkap di header `Icon.tsx` dan tetap berlaku: impor selalu dari `dist/ssr/<Nama>` supaya Server Component tidak terpaksa jadi `"use client"`, ukuran lewat `font-size`, dan `aria-hidden` dipasang oleh pembungkusnya.

Peta ikon sekarang 39 entri dengan ambang yang ditetapkan sendiri di ~40. Penambahan berikutnya memicu pemecahan file, bukan penambahan diam-diam.

Ikon mengikuti warna teks induknya. Ikon tidak pernah diberi warna magenta sendiri kecuali ia berada di dalam kontrol yang memang berwarna magenta.

### Imagery

- **Foto creator dan brand** tidak diberi overlay magenta. Overlay warna di atas wajah mengubah tone kulit.
- **`public/hero/creator-mascot.png`** (1,02 MB) jauh melebihi ukuran render-nya. Perlu dikompres atau diganti AVIF/WebP sebelum jadi bagian permanen dari brand hero. `[VERIFY]` ukuran render sebenarnya di berbagai breakpoint.
- **`public/platform/`** masih kosong (hanya berisi README), jadi `PlatformPanel` merender inisial "TT"/"SH". Kalau ikon platform ditambahkan, keduanya memakai logo resmi masing-masing, bukan versi bertint Haluan.

---

## 8. Voice dan tone

Sumbernya `GENERAL-WRITING-COPY-STYLE.md`. Dokumen itu berlaku penuh dan tidak diulang di sini.

Yang ditambahkan hanya yang spesifik brand Haluan:

### Kosakata yang dipakai deck

`Universe`, `creator`, `campaign`, `LIVE`, `GMV`, `brand`, `brief`, `content`, `performance`, `monetisasi`, `konversi`.

Semuanya istilah industri yang memang lebih umum daripada terjemahannya, sesuai `GENERAL-WRITING-COPY-STYLE.md` §3. Dipakai apa adanya, tidak diterjemahkan paksa.

### Pola judul

Deck memakai pola pendek dua bagian: pernyataan lalu konsekuensinya. Contoh dari deck: *"You create, we optimize, you earn."* — *"One universe, many ways to earn."* — *"From content to commerce, from creator to empire."*

Pola itu boleh diteruskan ke landing page. Yang tidak boleh diteruskan: judul bahasa Inggris di permukaan yang audience-nya creator Indonesia. Deck dibaca dalam presentasi berbahasa Indonesia; UI dibaca sendirian. Judul UI berbahasa Indonesia.

### Angka

Deck penuh angka pencapaian. Aturan §9 di copy style berlaku ketat di sini: **jangan pernah menyalin angka deck ke UI tanpa memverifikasi sumbernya.** Angka di deck adalah materi presentasi bertanggal; angka di produk harus berasal dari database. Kalau angka belum terverifikasi, tandai `[VERIFY]` dan jangan tayangkan.

---

## 9. Do dan don't

| Lakukan | Jangan |
|---|---|
| Label ink di atas `#FB007F` | Label putih di atas `#FB007F` (3.88, gagal AA) |
| Label ink di sepanjang `--gradient-hot` | Mencampur gradasi ink-safe baru dengan `--gradient-cta` lama yang white-safe |
| Satu Haluan Hot per viewport | Dua bidang bergradasi bersentuhan |
| Cyan sebagai teks hanya di tema gelap | Cyan sebagai teks di tema terang (2.12) |
| `#FFD5EA` sebagai latar pill | `#FFD5EA` sebagai warna teks (1.32) |
| Poppins 700 untuk display | `scaleX()` atau `font-stretch` untuk memalsukan lebar Agrandir |
| Bobot standar 400/500/600/700 | Bobot 550/650/750 dengan font statis |
| Hot pink untuk label ≥15px, action ramp untuk ≤14px | Satu warna tombol untuk semua ukuran |
| Chip aktif inversi netral | Lima chip magenta berjajar bersaing dengan CTA |
| Logo brand pihak ketiga apa adanya | Logo brand diberi tint atau overlay magenta |
| Focus ring dari `--focus-ring` netral | Focus ring dari `--accent` — magenta di atas tombol magenta (1.79) |
| `--danger` untuk error field | Magenta untuk error — bentrok dengan makna "aksi" |
| Judul UI berbahasa Indonesia | Menyalin judul bahasa Inggris deck ke UI creator |
| Angka dari database | Menyalin angka pencapaian deck ke produk |
| Ikon Phosphor lewat `Icon.tsx` | Glyph Unicode seperti di `AdminNav.tsx` |

---

## 10. Peta penerapan

**Sebagian besar sudah dikerjakan.** Tabel di bawah menandai mana yang sudah, mana yang belum.

Kabar baiknya: kodebase ini sudah token-clean. Di luar `tokens.css` hanya ada **enam** literal warna di seluruh repo, dan tidak ada satu pun utility class warna (tidak ada Tailwind di proyek ini — stylingnya CSS global buatan tangan). Jadi rebrand-nya berskala kecil dan terpusat.

| Berkas | Yang perlu disentuh | Status |
|---|---|---|
| `app/styles/tokens.css` | Inti pekerjaan. Palet, gradasi, font stack, bobot. Satu file. | **selesai** |
| `app/layout.tsx` | `viewport.themeColor` hardcode | **selesai** — `#fcfcfc` / `#090a0a` |
| `app/manifest.ts` | `background_color` / `theme_color` hardcode | **selesai** — `#fcfcfc` |
| `app/styles/catalog.css` | Satu-satunya hex di luar `tokens.css` | **selesai** — jadi `var(--action-contrast)` |
| `public/` — font | Ganti Archivo + Inter dengan Poppins + Open Sans | **selesai** — 6 berkas subset latin/latin-ext; berkas lama dihapus |
| `public/` — ikon | Regenerasi favicon dan icon PWA | **selesai** — marka huruf A Logo Haluan TAP, gradasi `#fb007f` → `#d226c7` dengan batang `#ff209d` semitransparan; `favicon.svg` + 4 PNG + badge monokrom dihasilkan `scripts/build-brand.mjs`, yang sekarang benar-benar ada di repo |
| `public/og.jpg` | Kartu share 1200×630 | **sengaja tidak diubah** — aset 3D yang diproduksi khusus dan masih terlihat baik; menggantinya dengan vektor datar justru menurunkan kualitasnya |
| `STITCH-DESIGN-SPEC.md` §2.1–2.9 | Cermin dari `tokens.css` | **belum** |
| `app/admin/(dashboard)/AdminNav.tsx` | Glyph Unicode → `Icon.tsx` (§6.4) | **selesai** — beserta 16 berkas admin lain dan toggle kata sandi |

Dua keputusan yang diambil saat penerapan, karena dokumen ini bisa dibaca dua arah:

1. **`--gradient-hot` hanya dipakai di join banner.** §3.1 menyebutnya juga untuk "isian CTA besar", tapi §3.4 membatasi satu Haluan Hot per viewport — sedangkan satu layar katalog memuat ~24 tombol kartu. Tombol memakai isian solid.
2. **Tombol kartu deal memakai action ramp, bukan hot pink.** §6.1 mendaftarkannya sebagai permukaan hot pink, tapi aturan ukurannya tegas (≥15px hot pink, ≤14px action ramp) dan label tombol itu 14px di desktop, 12px di ponsel. `.btn` umum justru dinaikkan ke 16px supaya tanda tangan hot-pink + ink muncul di tempat yang memang lapang.

Satu koreksi terhadap §2.5 yang ditemukan axe saat penerapan: `--accent` `#c90063` di atas `--accent-soft` `#ffd5ea` hanya **4,36** dan gagal AA. Pasangan itu tidak ada di tabel §2.5. Badge yang memakainya (`.badge-new-sku`, `.badge-hot-top-brand`) dipindah ke `--accent-strong` `#b3005a` (5,21) — pola yang memang sudah dipakai `.search-suggestions` dan pil aktif `.mobile-nav`.

Dua hal yang sebaiknya dibereskan **sebelum** restyling, bukan sesudah:

1. **Normalisasi breakpoint** (§5). Kalau tidak, setiap perbaikan visual dikerjakan dua kali.
2. **Duplikasi `workspace.css` dan `admin.css`.** `workspace.css` 2.293 baris dan menduplikasi `admin.css` di dua tempat — stat tile (`.admin-stats` / `.kpi-grid`) dan tabel (`.admin-table-wrap` / `.table-wrap`). Komentar di `workspace.css:433` dan `:528` sudah mengakuinya.

Satu catatan yang mudah terlewat: `--brand`, `--brand-deep`, `--brand-press`, `--brand-acid`, dan `--brand-cyan` di `tokens.css:52-56` **dideklarasikan tapi tidak pernah dipakai** — `grep "var(--brand"` di seluruh CSS dan TSX tidak menghasilkan apa pun. Semuanya token dokumentasi. Saat rebrand, kelimanya diganti nilai §2.1 dan mulai benar-benar dirujuk, atau dihapus. Jangan dibiarkan jadi palet mati untuk kedua kalinya.

---

## Lampiran A — blok token siap salin

Belum diterapkan. Salin ke `app/styles/tokens.css` saat pekerjaan §10 dimulai. Komentar rasio mengikuti gaya yang sudah ada di berkas itu.

```css
@font-face {
  font-family: Poppins;
  src: url("/poppins-600.woff2") format("woff2");
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: Poppins;
  src: url("/poppins-700.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
}

@font-face {
  font-family: "Open Sans";
  src: url("/open-sans.woff2") format("woff2");
  font-weight: 400 600;
  font-display: swap;
}

:root {
  color-scheme: dark;

  /* Brand core — diekstrak dari Haluan Creator Universe Deck. */
  --brand-magenta: #fb007f;
  --brand-magenta-deep: #ec008c;
  --brand-magenta-bright: #ff209d;
  --brand-violet: #d226c7;
  --brand-pink-tint: #ffd5ea;
  --brand-cyan: #00bef3;
  --brand-ink: #090a0a;
  --brand-paper: #fcfcfc;

  /* Permukaan */
  --bg: #090a0a;
  --surface: #0e0e13;
  --surface-sunken: #060607;
  --surface-raised: #14141b;
  --line: rgba(255, 255, 255, 0.1);
  --line-strong: rgba(255, 255, 255, 0.18);

  /* Teks */
  --text: #ffffff;
  --text-muted: rgba(255, 255, 255, 0.74);
  --text-subtle: rgba(255, 255, 255, 0.58);
  --text-inverse: #090a0a;

  /**
   * Cyan membawa elemen interaktif di tema gelap: 8,85 di atas --surface.
   * Di tema terang cyan hanya 2,12 dan tidak pernah membawa teks.
   */
  --accent: #00bef3;
  --accent-strong: #7fdcf8;
  --accent-soft: rgba(0, 190, 243, 0.14);
  --accent-line: rgba(0, 190, 243, 0.3);
  --accent-contrast: #090a0a;

  /**
   * Tombol utama memakai magenta penuh dengan label INK, bukan putih:
   * putih di atas #fb007f hanya 3,88 dan gagal AA, sedangkan ink mencapai
   * 5,10. Hover menyala (5,61), press turun (4,67) — ketiganya lolos.
   */
  --cta: #fb007f;
  --cta-hover: #ff209d;
  --cta-press: #ec008c;
  --cta-contrast: #090a0a;

  /**
   * Varian padat untuk label ≤14px, di mana magenta penuh berlabel hitam
   * mulai terbaca seperti stabilo. Label putih, hue sama, luminance turun.
   */
  --action: #d60069;
  --action-hover: #c90063;
  --action-press: #be005e;
  --action-contrast: #ffffff;

  /**
   * Focus ring TIDAK boleh diturunkan dari --accent lagi. Di tema terang
   * --accent kini magenta, dan ring magenta di atas tombol magenta hilang.
   *
   * WCAG 1.4.11 menuntut ≥3.0 terhadap komponen DAN latar sekelilingnya.
   * Tidak ada warna brand yang lolos keduanya di atas #fb007f — cyan cuma
   * 1,79. Putih lolos: 3,88 terhadap tombol, 19,82 terhadap --bg.
   *
   * Dipakai sebagai outline dengan outline-offset: 2px, bukan box-shadow
   * menempel, supaya ring duduk di latar halaman.
   */
  --focus-ring: #ffffff;

  /* Status — tidak diubah dari palet sebelumnya, sudah lolos AA. */
  --positive: #5fd3a0;
  --positive-soft: rgba(95, 211, 160, 0.13);
  --warning: #e8b45e;
  --warning-soft: rgba(232, 180, 94, 0.13);
  --danger: #f0857c;
  --danger-soft: rgba(240, 133, 124, 0.13);

  /* Aksen platform — tidak diubah. Lihat §2.4. */
  --platform-tiktok: #1fd8d1;
  --platform-shopee: #f2652f;
  --platform-shopee-solid: #c2410c;

  /**
   * Gradasi Haluan berlabel INK, kebalikan dari gradasi lama yang white-safe.
   * Titik terburuk --gradient-hot untuk ink adalah ujung violet: 4,57.
   * Untuk --gradient-soft: 8,92. Keduanya tidak pernah memuat teks ≤14px.
   */
  --gradient-hot: linear-gradient(135deg, #fb007f 0%, #ec008c 50%, #d226c7 100%);
  --gradient-soft: linear-gradient(160deg, #fffafd 0%, #ffe1f3 38%, #fec2e5 72%, #f585ec 100%);
  --gradient-wash: radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, #fb007f 12%, transparent) 0%, transparent 62%);

  /**
   * Tipografi. Poppins untuk display, Open Sans untuk isi.
   *
   * Poppins di Google Fonts TIDAK variable, jadi bobotnya harus kelipatan
   * 100 — 550/650/750 akan dibulatkan browser dengan hasil tak terduga.
   *
   * Open Sans sengaja mendahului font sistem meski itu membatalkan
   * penghematan unduhan di iOS/macOS: SF Pro terlihat jelas berbeda, dan
   * konsistensi huruf adalah inti dari brand system ini.
   */
  --font-display: Poppins, system-ui, sans-serif;
  --font-body: "Open Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-display: 700;

  /* Poppins geometris terasa renggang di ukuran display, dan uppercase-nya
     butuh lebih banyak ruang daripada Archivo. */
  --tracking-display: -0.03em;
  --tracking-tight: -0.015em;
  --tracking-wide: 0.08em;
}

/**
 * Tema terang memakai paper #fcfcfc dari deck, bukan krem warisan lama.
 *
 * Cyan tidak pernah membawa teks di sini (2,12 di atas paper) — hanya bidang
 * dan garis. Aksen teks pindah ke magenta gelap #c90063 (5,59).
 */
:root[data-theme="light"] {
  color-scheme: light;

  --bg: #fcfcfc;
  --surface: #ffffff;
  --surface-sunken: #f9f9f9;
  --surface-raised: #ffffff;
  --line: rgba(9, 10, 10, 0.12);
  --line-strong: rgba(9, 10, 10, 0.2);

  --text: #090a0a;
  --text-muted: #4a4a55;
  --text-subtle: #63636e;
  --text-inverse: #ffffff;

  --accent: #c90063;
  --accent-strong: #b3005a;
  --accent-soft: #ffd5ea;
  --accent-line: rgba(201, 0, 99, 0.26);
  --accent-contrast: #ffffff;

  /* Kalau tema terang butuh aksen dingin yang membawa teks, ini nilainya
     (5,92 di atas paper). Cyan brand tidak bisa dipakai untuk itu. */
  --accent-cool-text: #046b87;

  /* Tombol utama identik di kedua tema: kontras label diukur terhadap isian
     tombol, bukan terhadap latar halaman, jadi nilainya tidak berubah. */
  --cta: #fb007f;
  --cta-hover: #ff209d;
  --cta-press: #ec008c;
  --cta-contrast: #090a0a;

  --action: #d60069;
  --action-hover: #c90063;
  --action-press: #be005e;
  --action-contrast: #ffffff;

  /* Ink: 5,10 terhadap tombol #fb007f, 19,32 terhadap paper. */
  --focus-ring: #090a0a;

  --positive: #0d7a52;
  --positive-soft: #e3f4ec;
  --warning: #8a5a00;
  --warning-soft: #fbf1df;
  --danger: #b3261e;
  --danger-soft: #fbeae8;

  --platform-tiktok: #0a8f88;
  --platform-shopee: #ee4d2d;

  /* Hanya bayangan tema TERANG yang ditulis ulang: warnanya diturunkan dari
     ink, dan ink berubah dari #08080a ke #090a0a. Bayangan tema gelap memakai
     rgba(0,0,0,...) murni, tidak terpengaruh, jadi tidak dicantumkan di sini. */
  --shadow-sm: 0 1px 2px rgba(9, 10, 10, 0.06);
  --shadow-md: 0 4px 14px rgba(9, 10, 10, 0.08);
  --shadow-lg: 0 18px 48px rgba(9, 10, 10, 0.14);
  --shadow-card: 0 2px 10px rgba(9, 10, 10, 0.05);
}
```

Spasi, radius, ikon, layout, bayangan tema gelap, dan gerak tidak dicantumkan ulang di sini — nilainya tidak berubah dari `tokens.css` yang sekarang (§5).

---

## Lampiran B — verifikasi kontras

Simpan sebagai skrip sekali pakai, jalankan, cocokkan dengan tabel §2.5. Semua angka di dokumen ini dihasilkan dari rumus yang sama.

```js
// node contrast.mjs
const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

const luminance = (hex) => {
  const [r, g, b] = hex.replace("#", "").match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

const INK = "#090A0A";
const WHITE = "#FFFFFF";
const PAPER = "#FCFCFC";

const checks = [
  ["putih di #FB007F", WHITE, "#FB007F", 3.88],
  ["ink di #FB007F", INK, "#FB007F", 5.1],
  ["ink di #EC008C", INK, "#EC008C", 4.67],
  ["ink di #FF209D", INK, "#FF209D", 5.61],
  ["ink di #D226C7", INK, "#D226C7", 4.57],
  ["putih di #D226C7", WHITE, "#D226C7", 4.34],
  ["ink di #FFD5EA", INK, "#FFD5EA", 15.06],
  ["#00BEF3 di ink", "#00BEF3", INK, 9.12],
  ["#00BEF3 di paper", "#00BEF3", PAPER, 2.12],
  ["#FF209D di #0E0E13", "#FF209D", "#0E0E13", 5.45],
  ["#C90063 di paper", "#C90063", PAPER, 5.59],
  ["putih di #D60069", WHITE, "#D60069", 5.17],
  ["putih di #C90063", WHITE, "#C90063", 5.73],
  ["putih di #BE005E", WHITE, "#BE005E", 6.27],
  ["ink di #F585EC", INK, "#F585EC", 8.92],
  ["#046B87 di paper", "#046B87", PAPER, 5.92],
  // Focus ring — wajib >=3.0 terhadap tombol DAN latar (WCAG 1.4.11).
  ["ring terang vs tombol", INK, "#FB007F", 5.1],
  ["ring terang vs paper", INK, PAPER, 19.32],
  ["ring gelap vs tombol", WHITE, "#FB007F", 3.88],
  ["ring gelap vs bg", WHITE, INK, 19.82],
  // Kenapa cyan tidak bisa jadi ring: nyaris tidak terlihat di atas tombol.
  ["cyan vs tombol (gagal)", "#00BEF3", "#FB007F", 1.79],
];

let gagal = 0;
for (const [nama, fg, bg, harapan] of checks) {
  const nyata = ratio(fg, bg);
  const cocok = Math.abs(nyata - harapan) < 0.01;
  if (!cocok) gagal++;
  console.log(`${cocok ? "ok  " : "BEDA"} ${nama.padEnd(22)} ${nyata}${cocok ? "" : ` (dokumen: ${harapan})`}`);
}
console.log(gagal === 0 ? "\nSemua cocok dengan §2.5." : `\n${gagal} nilai tidak cocok — perbarui §2.5.`);
```

Ambang yang dipakai: **AA teks normal 4.5**, **AA teks besar 3.0** (≥24px, atau ≥19px bold), **AA komponen non-teks 3.0**.
