# Sheet Sync Runbook — TAP Catalog

Cara menyiapkan workbook internal supaya bisa dipakai TAP. Jalankan urut.

## 0. Sebelum mulai

Sumbernya adalah workbook `Haluan Digital Agency Internal (Agustus 2026).xlsx`.
Dua worksheet yang dipakai:

| Worksheet | Dipakai untuk |
| --- | --- |
| `List Campaign (All TAP)` | Brand, kategori, komisi creator, TAP link |
| `GMV Campaign Brand` | Status sample support dan peringkat GMV |

Worksheet lain tidak dibaca aplikasi.

> **Catatan keamanan.** Saat ditulis, workbook ini bisa diunduh siapa pun yang
> punya link, tanpa login. Isinya memuat GMV internal, nama PIC, dan sheet
> operasional lain. Batasi aksesnya di Drive, terlepas dari pekerjaan ini.

---

## 1. Konversi ke Google Sheet

File aslinya `.xlsx` berukuran 27 MB dan tidak bisa diambil aplikasi secara
langsung. Buka di Google Sheets, lalu **File → Save as Google Sheets**.

---

## 2. Materialisasi TAP link — WAJIB

Di kolom `TAP LINK`, **teks selnya kosong**. URL-nya hanya tersimpan sebagai
hyperlink. Ekspor CSV hanya membawa teks, jadi tanpa langkah ini kolomnya
terkirim kosong dan katalog tidak memuat satu campaign pun.

**Extensions → Apps Script**, tempel, jalankan `materialiseTapLinks`:

```js
function materialiseTapLinks() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('List Campaign (All TAP)');
  const rows = sheet.getLastRow() - 1;
  const rich = sheet.getRange(2, 7, rows, 1).getRichTextValues();   // kolom G
  sheet.getRange(1, 13).setValue('TAP LINK URL');                    // kolom M
  sheet.getRange(2, 13, rows, 1).setValues(rich.map((row) => [row[0].getLinkUrl() || '']));
}
```

Ulangi setiap kali ada baris campaign baru.

Verifikasi: kolom `TAP LINK URL` terisi `https://affiliate-id.tokopedia.com/...`.
`scripts/sync-campaign-links.mjs` menolak feed yang kolom link-nya kosong dan
menyebut langkah ini di pesan errornya.

---

## 3. Ambil URL ekspor CSV

Untuk tiap worksheet: **File → Share → Publish to web → pilih worksheet → CSV**,
atau pakai bentuk `export`:

```
https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=<GID>
```

`gid` ada di URL saat worksheet-nya aktif.

---

## 4. Sinkronkan ke penyimpanan privat

```bash
npm run sync:campaign-links   -- "<csv-url-List-Campaign-All-TAP>"
npm run sync:shopee-campaigns -- "<csv-url-Shopee>"
npm run sync:brand-metrics    -- "<csv-url-GMV-Campaign-Brand>"
```

Ketiganya menulis ke Redis privat. Sheet tidak pernah dibaca langsung oleh
pengunjung — aturan "no public raw-link sheet in production" tetap berlaku.

---

## 5. Periksa hasilnya

```bash
npm run audit:rates          # baris yang ditolak parser, per brand
npm run smoke:catalog-source # katalog tidak kosong
```

`audit:rates` mencantumkan sel yang tidak bisa dibaca dengan pasti. Sel itu
sengaja tidak ditebak: brand-nya tetap tayang dengan komisi `—`. Perbaiki di
spreadsheet lalu sinkronkan ulang, atau timpa angkanya lewat **Admin → Katalog
Campaign**.

---

## Aturan pembacaan angka

Yang perlu diketahui tim ops saat merapikan sheet.

**Komisi.** Sel numerik dibaca sebagai pecahan (`0.09` = 9%), sel teks dibaca
apa adanya (`9%` = 9%). Rentang memakai batas bawah (`9-10%` → 9%). Daftar tier
memakai nilai terkecil (`10,11,12%` → 10%). Penanda versi dibuang
(`11% 2.0` → 11%).

Ditolak, bukan ditebak:

| Nilai | Alasan |
| --- | --- |
| `10-1%` | rentang menurun, hampir pasti salah ketik `10-11%` |
| `8,10` | satu koma dua digit — bisa 8,10 desimal atau tier 8 dan 10 |
| `Beauty`, `raecca` | kolom bergeser, isinya bukan angka |

`7,5%` tetap dibaca sebagai 7,5% — koma desimal Indonesia aman.

**Komisi yang tampil di kartu adalah nilai TERKECIL milik brand itu.** Kalau
sebuah brand punya campaign 8%, 9%, dan 10%, kartunya menulis 8%. Angka tiap
campaign tetap bisa dilihat di detail brand.

**Sample support** diambil dari kolom `Sample support` di `GMV Campaign Brand`
(`1` = tersedia, `0` = tidak). Brand yang tidak punya baris di sheet itu
ditampilkan tanpa badge — "belum diketahui" bukan "tidak tersedia".

**GMV** hanya dipakai untuk mengurutkan. Nilai rupiahnya tidak pernah dikirim ke
browser; yang keluar dari server hanya peringkat relatifnya.
