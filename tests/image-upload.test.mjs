import assert from "node:assert/strict";
import test from "node:test";
import { processAndUploadLogo } from "../lib/image-upload.ts";

// These three rejection paths never reach the network (Vercel Blob). They're
// pure decode/validation checks, so they're safe to unit test without a real
// BLOB_READ_WRITE_TOKEN. The "real image succeeds and lands in Blob" case is
// covered by a live smoke script instead, same convention as every other
// Prisma/network-touching module in this project (see tests/. None hit a
// real datastore directly).

test("file di atas 5MB ditolak sebelum didekode", async () => {
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  const result = await processAndUploadLogo(oversized, "big-file");
  assert.deepEqual(result, { ok: false, reason: "TOO_LARGE" });
});

test("SVG ditolak lewat signature, walau ekstensi/nama file menyamar sebagai gambar lain", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const result = await processAndUploadLogo(svg, "logo.png");
  assert.deepEqual(result, { ok: false, reason: "SVG_REJECTED" });
});

test("file teks biasa berekstensi gambar tetap ditolak (byte sungguhan diperiksa, bukan nama file)", async () => {
  const fakeImage = Buffer.from("this is definitely not an image, just plain text pretending to be one");
  const result = await processAndUploadLogo(fakeImage, "not-really-a.jpg");
  assert.deepEqual(result, { ok: false, reason: "NOT_AN_IMAGE" });
});

test("XML tanpa tag <svg> tidak salah ditolak sebagai SVG (hanya XML biasa)", async () => {
  const xml = Buffer.from('<?xml version="1.0"?><root>plain data</root>');
  const result = await processAndUploadLogo(xml, "data.xml");
  // Not SVG-rejected. But still not a real image, so NOT_AN_IMAGE is the correct outcome.
  assert.deepEqual(result, { ok: false, reason: "NOT_AN_IMAGE" });
});
