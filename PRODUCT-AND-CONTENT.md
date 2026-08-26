# TAP by Haluan — Product & Content Reference

## Product purpose

`TAP by Haluan` adalah microsite creator enablement di bawah Haluan Digital Network dengan dua fungsi utama:

1. Showcase campaign affiliate dan extra commission.
2. Request sample produk untuk creator.

Target subdomain: `tap.haluandigital.agency`.

## Name

Nama kerja yang dipilih adalah **TAP by Haluan**. Nama ini terasa lebih khas dan dapat berkembang melampaui istilah generik “Komisi Extra”. TAP dapat dipresentasikan sebagai creator advantage platform tanpa harus selalu dieja sebagai akronim.

## Primary journeys

- Creator membuka homepage → mencari/filter campaign → melihat open plan, rate Haluan, dan delta.
- Creator memilih campaign satu-link → login/verifikasi anggota MCN bila diperlukan → kembali otomatis ke campaign → atribusi dicatat server → langsung diarahkan ke halaman campaign platform. Selector internal hanya dipakai jika satu brand benar-benar memiliki beberapa link.
- Creator membuka campaign → memilih `Sample` → mengisi request sample.
- Creator yang belum bergabung → menuju form pendaftaran network Haluan.

## Public route map

- `/` — landing page dan enam deal unggulan; CTA katalog diarahkan ke halaman penuh.
- `/deals` — katalog lengkap TikTok dan Shopee Affiliate dengan tab platform, pencarian dominan, shortcut request sample, filter, sorting, pilihan grid/list, dan pagination ringan.
- `/request-sample` — penjelasan publik, preflight login/membership, dan form ter-prefill khusus creator terverifikasi.
- `/daftar` — authentication gateway ringkas dengan nama, WhatsApp, email, dan kata sandi; tombol Google hanya muncul setelah OAuth production aktif.
- `/dashboard` — home creator setelah daftar/masuk: onboarding singkat, kelengkapan profil, akses link komisi, request sample, dan weekly product intelligence.
- `/admin` — workspace operasional terproteksi role server: overview, database creator, membership approval, campaign brand, request sample, dan product intelligence.

Setelah autentikasi berhasil, creator diarahkan ke area utama creator/deal terakhir yang dibuka. Kelengkapan profil seperti akun sosial, kategori konten, alamat sample, dan data pembayaran dikumpulkan setelah login melalui checklist profil, bukan di form pendaftaran pertama.

Shopee Affiliate sudah aktif sebagai katalog campaign terpisah. Feed Shopee tidak memiliki kolom rate komisi, sehingga UI hanya menyatakan link campaign, sample, dan harga khusus live yang benar-benar tersedia; angka rate tidak diestimasi atau dicampur dari TikTok.

## Public vs protected data

Katalog publik hanya menerima field yang tersedia untuk platform terkait:

- Nama brand dan kategori.
- Open-plan commission.
- Creator commission Haluan.
- Delta commission.
- Jumlah pilihan link.
- Ketersediaan sample.
- Platform, ketersediaan harga khusus live, dan jumlah pilihan link.

Field berikut tidak boleh dikirim ke browser publik:

- Feed operasional mentah (CSV/Redis master) beserta seluruh isinya.
- Link worksheet brand.
- Catatan operasional tim.
- Data PIC dan creator PII.

Link campaign per brand justru sengaja publik agar creator dapat membagikannya; endpoint-nya dibatasi rate limit dan atribusi tetap tercatat lewat `/go/{campaignId}`. Tombol `Buka deal`/`Buka campaign` membuka etalase tanpa login. Login hanya diperlukan untuk request sample dan fitur creator.

## Data source

Source of truth operasional awal adalah Google Sheet TikTok `TAP LINK HDA` dan Sheet campaign Shopee, lalu masing-masing feed disinkronkan ke key Redis privat yang terpisah. Di production, API katalog menurunkan field publik yang aman dari feed privat tersebut; katalog teragregasi tidak memuat URL, sedangkan link per campaign dilayani terpisah dengan throttling. Resolver link hanya dibaca server; tidak ada fallback ke Sheet publik.

Foto campaign dapat diisi melalui salah satu header `Image URL`, `Campaign Image`, atau `Product Image`. Nilainya wajib URL HTTPS dan harus menggambarkan campaign/SKU yang benar; gambar pertama yang valid untuk setiap brand dipakai sebagai cover katalog.

Snapshot audit 16 Agustus 2026:

- 508 baris data.
- 464 baris memiliki TAP link.
- 421 nama brand unik pada sumber mentah.
- 402 baris dapat dibandingkan open-plan vs creator commission.
- 336 baris memiliki delta positif.
- Rata-rata delta positif sekitar `+2,56%`.
- Katalog publik menghasilkan sekitar 320 brand dengan rate lebih tinggi setelah normalisasi dan deduplikasi.

## Design direction

- Dark premium system dari Haluan Digital V2.
- Cyan untuk primary actions, pink untuk urgency/hot campaign, violet untuk continuity dengan HDA.
- Interface ringan, filter horizontal, kartu besar dan mudah dipindai.
- Mobile-first: grid katalog memakai dua kartu ringkas per baris untuk discovery cepat; mode list tetap satu baris penuh untuk pembacaan detail. Pencarian, komisi, dan CTA tetap terlihat jelas.
- Katalog menjelaskan `Open plan`, total `Rate Haluan`, dan nilai `Extra` sebelum daftar kartu; pencarian mencakup brand, nama campaign, dan kategori serta mendukung `⌘/Ctrl + K`.
- Logo brand memakai kombinasi aset lokal terkurasi, favicon resolusi tinggi dari domain resmi yang dipetakan eksplisit, dan fallback inisial. Daftar gabungan brand TikTok/Shopee yang belum memiliki aset terpercaya ada di `BRAND-LOGO-GAPS.md`; foto acak tanpa mapping campaign/SKU tidak digunakan.

Audit quality dan keputusan launch tercatat di `BOARD-REVIEW.md`.

## Product intelligence

`Product of the Week` dirancang sebagai USP di atas katalog komisi. Kandidat tidak dipilih hanya karena viral, tetapi memakai skor awal:

- Sales velocity: 30%.
- Creator growth: 20%.
- Low saturation: 15%.
- Extra commission TAP: 20%.
- Sample readiness: 15%.

FastMoss dapat menyediakan ranking top-selling, historical product sales, associated creator/video, dan market ranking melalui API. Kalodata dipakai sebagai sumber pembanding untuk trending product, creator, video/live, dan competitor insight. Semua angka pihak ketiga diperlakukan sebagai market intelligence/estimasi dan harus divalidasi dengan conversion serta attribution first-party TAP.

## Current production status

- Campaign publik membaca feed Redis privat dan hanya menerbitkan field aman untuk deal dengan delta positif.
- Affiliate link mentah tidak dikirim ke katalog; link dibaca dari source privat lalu dibuka server-side melalui `/go/{campaignId}` setelah session dan membership diverifikasi serta click dicatat.
- Credential auth, salted password hashing, session HttpOnly, creator profile, request sample persistence, controlled lifecycle, audit log, dan server-side admin role gate sudah diimplementasikan.
- Google OAuth flow sudah diimplementasikan tetapi sengaja ditunda; UI otomatis menyembunyikan tombol Google sampai client credentials tersedia.
- Seluruh state akun/operasional membutuhkan Redis khusus TAP. Sistem sengaja fail-closed bila datastore belum dikonfigurasi.
- Product intelligence belum menampilkan pemenang atau angka sampai FastMoss/Kalodata dan data conversion TAP tersambung.
- Katalog Shopee Affiliate memakai feed privat terpisah, menampilkan benefit tanpa rate palsu, dan mendukung resolver link serta request sample platform-aware.
- Beberapa nilai sumber masih tidak konsisten dan membutuhkan validasi/data hygiene sebelum production.

## Production checklist

- Normalisasi kolom category, open plan, creator commission, status, tanggal, dan sample availability di Google Sheet.
- Pertahankan sinkronisasi Sheet → Redis privat, konfigurasikan admin allowlist dan Google OAuth, lalu audit feed sebelum setiap kampanye besar.
- Jalankan verifikasi membership terhadap master creator/MCN melalui admin workspace.
- Tentukan PIC dan SLA operasional request sample.
- Tentukan approval/status workflow dan notifikasi WhatsApp/email.
- Jalankan review organisasi terhadap privacy notice, retention, dan incident response yang sudah disiapkan.
- Pasang domain `tap.haluandigital.agency` setelah deployment final.
