# Data wilayah (BPS)

`db_wilayah_bps.sql.gz` is the "BPS Semester 1 Tahun 2025" administrative-code
dump from [SalzBytes/wilayah_indonesia](https://github.com/SalzBytes/wilayah_indonesia)
(MIT licensed), vendored here so `scripts/seed-wilayah.mjs` can seed
Province/Regency/District/Village offline and reproducibly instead of
depending on a live download at seed time.

Tables used: `m_provinsi`, `m_kabupaten`, `m_kecamatan`, `m_kelurahan`. Only
`kode_bps`/`nama_bps` and the parent-id columns are read — see
`scripts/seed-wilayah.mjs`. Re-vendor this file (and bump the note below) if
a newer administrative-code revision needs to be picked up.

Source revision: BPS Semester 1 2025 / Kemendagri 2025, dumped 2026-05-09.
