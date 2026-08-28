/**
 * The 9 required fields the doc names for a "complete" creator profile:
 * nama, WhatsApp, alamat 4-tingkat wilayah (provinsi/kabupaten/kecamatan/
 * desa), alamat lengkap, kode pos, nomor penerima paket.
 *
 * A pure function so /daftar/lengkapi, /dashboard, /dashboard/profil, and
 * the sample-request gate can all agree on one definition without importing
 * each other.
 */

export type ProfileCompletenessInput = {
  name: string | null | undefined;
  phone: string | null | undefined;
  provinceId: string | null | undefined;
  regencyId: string | null | undefined;
  districtId: string | null | undefined;
  villageId: string | null | undefined;
  detailAddress: string | null | undefined;
  postalCode: string | null | undefined;
  recipientPhone: string | null | undefined;
};

const FIELDS: Array<[keyof ProfileCompletenessInput, string]> = [
  ["name", "Nama lengkap"],
  ["phone", "Nomor WhatsApp"],
  ["provinceId", "Provinsi"],
  ["regencyId", "Kabupaten/Kota"],
  ["districtId", "Kecamatan"],
  ["villageId", "Kelurahan/Desa"],
  ["detailAddress", "Alamat lengkap"],
  ["postalCode", "Kode pos"],
  ["recipientPhone", "Nomor penerima paket"],
];

export type ProfileCompleteness = {
  percent: number;
  complete: boolean;
  missingFields: string[];
};

export function computeProfileCompleteness(input: ProfileCompletenessInput): ProfileCompleteness {
  const missingFields = FIELDS.filter(([key]) => !input[key]?.toString().trim()).map(([, label]) => label);
  const percent = Math.round(((FIELDS.length - missingFields.length) / FIELDS.length) * 100);
  return { percent, complete: missingFields.length === 0, missingFields };
}
