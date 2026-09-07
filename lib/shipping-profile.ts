import type { TapUser } from "./models.ts";

/**
 * Data pengiriman sample, DISUSUN DARI PROFIL — bukan diketik ulang.
 *
 * Sebelumnya /request-sample meminta creator mengetik nama penerima, nomor,
 * dan tujuh bagian alamat di setiap request, lalu server menyimpan apa pun
 * yang diketik. Padahal gerbang sample sudah menuntut profil dan alamat
 * lengkap sebelum request boleh masuk — jadi data itu selalu sudah ada di
 * profil, dan meminta ulang hanya menghasilkan dua versi alamat yang bisa
 * saling bertentangan.
 *
 * Sekarang server yang menyusunnya, dari satu sumber. Format teksnya sama
 * dengan yang dulu dirangkai klien (jalan, RT/RW, Kel., Kec., kabupaten,
 * provinsi, kode pos), sehingga baris lama dan baru terbaca seragam di admin.
 *
 * Mengembalikan null bila profil tidak cukup untuk dikirimi paket. Dalam
 * praktik gerbang sample menolak lebih dulu (PROFILE_INCOMPLETE); null di
 * sini adalah pengaman kedua, bukan jalur utama.
 */
export type ShippingFromProfile = { recipientName: string; phone: string; address: string };

type ProfileLike = Pick<TapUser, "name" | "phone" | "recipientName" | "shipping">;

export function composeShippingFromProfile(user: ProfileLike): ShippingFromProfile | null {
  const ship = user.shipping;
  if (!ship) return null;
  const rtRw = [ship.rt, ship.rw].filter(Boolean).join("/");
  const address = [
    ship.street,
    rtRw ? `RT/RW ${rtRw}` : "",
    ship.village ? `Kel. ${ship.village}` : "",
    ship.district ? `Kec. ${ship.district}` : "",
    ship.regency,
    ship.province,
    ship.postalCode,
  ].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
  const phone = (ship.recipientPhone || user.phone || "").trim();
  // Urutan: nama penerima di tab Alamat → Creator.recipientName (warisan) → nama akun.
  const recipientName = (ship.recipientName || user.recipientName || user.name || "").trim();
  if (address.length < 12 || phone.replace(/\D/g, "").length < 9 || !recipientName) return null;
  return { recipientName, phone, address };
}

/** Tautan profil yang lazim per platform, dari username — bisa disunting creator. */
export function defaultProfileUrl(platform: string, username: string | undefined): string {
  const handle = (username ?? "").replace(/^@/, "").trim();
  if (!handle) return "";
  return platform === "Shopee" ? `https://shopee.co.id/${handle}` : `https://www.tiktok.com/@${handle}`;
}
