import assert from "node:assert/strict";
import test from "node:test";
import { composeShippingFromProfile, defaultProfileUrl } from "../lib/shipping-profile.ts";

/**
 * Data kirim sample disusun dari profil oleh server. Yang dijaga: formatnya
 * sama dengan yang dulu dirangkai klien (supaya baris lama dan baru seragam),
 * prioritas penerima/nomor, dan penolakan profil yang tidak cukup.
 */

const full = {
  name: "Dian Kreator", phone: "0812000111", recipientName: "Dian K.",
  shipping: { street: "Jl. Mawar No. 5", rt: "001", rw: "002", village: "Menteng", district: "Menteng", regency: "Jakarta Pusat", province: "DKI Jakarta", postalCode: "10310", recipientPhone: "0813999888" },
};

test("alamat dirangkai dengan format yang sama seperti klien lama", () => {
  const r = composeShippingFromProfile(full);
  assert.equal(r.address, "Jl. Mawar No. 5, RT/RW 001/002, Kel. Menteng, Kec. Menteng, Jakarta Pusat, DKI Jakarta, 10310");
});

test("penerima: nama di tab Alamat didahulukan, lalu Creator.recipientName, lalu nama akun", () => {
  // Bug yang ditemukan e2e: dua kolom bernama recipientName; yang di tab Alamat
  // (CreatorAddress) adalah yang creator isi, dan itu yang harus dipakai.
  assert.equal(composeShippingFromProfile({ ...full, shipping: { ...full.shipping, recipientName: "Penerima Alamat" } }).recipientName, "Penerima Alamat");
  assert.equal(composeShippingFromProfile(full).recipientName, "Dian K.");
  assert.equal(composeShippingFromProfile({ ...full, recipientName: undefined }).recipientName, "Dian Kreator");
});

test("nomor: nomor penerima paket didahulukan, lalu WhatsApp akun", () => {
  assert.equal(composeShippingFromProfile(full).phone, "0813999888");
  assert.equal(composeShippingFromProfile({ ...full, shipping: { ...full.shipping, recipientPhone: undefined } }).phone, "0812000111");
});

test("RT tanpa RW tetap dirangkai, bukan 'RT/RW 001/'", () => {
  const r = composeShippingFromProfile({ ...full, shipping: { ...full.shipping, rw: undefined } });
  assert.match(r.address, /RT\/RW 001,/);
});

test("tanpa shipping, alamat terlalu pendek, atau nomor pendek → null", () => {
  assert.equal(composeShippingFromProfile({ name: "A", phone: "0812000111" }), null);
  assert.equal(composeShippingFromProfile({ ...full, shipping: { street: "Jl. A" } }), null);
  assert.equal(composeShippingFromProfile({ ...full, phone: "", shipping: { ...full.shipping, recipientPhone: "123" } }), null);
});

test("URL profil per platform, tanda @ dibuang", () => {
  assert.equal(defaultProfileUrl("TikTok", "@dian"), "https://www.tiktok.com/@dian");
  assert.equal(defaultProfileUrl("Shopee", "dian"), "https://shopee.co.id/dian");
  assert.equal(defaultProfileUrl("TikTok", undefined), "");
});
