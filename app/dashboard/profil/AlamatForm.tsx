"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateAlamat } from "./actions";

export type WilayahOption = { id: string; name: string };

export type AlamatInput = {
  recipientName: string;
  provinceId: string;
  regencyId: string;
  districtId: string;
  villageId: string;
  detailAddress: string;
  rt: string;
  rw: string;
  postalCode: string;
  recipientPhone: string;
};

async function fetchWilayah(path: string, param: string, id: string): Promise<WilayahOption[]> {
  try {
    const response = await fetch(`/api/wilayah/${path}?${param}=${encodeURIComponent(id)}`);
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: WilayahOption[] };
    return payload.items ?? [];
  } catch {
    return [];
  }
}

export default function AlamatForm({
  initial,
  provinces,
  initialRegencies,
  initialDistricts,
  initialVillages,
}: {
  initial: AlamatInput;
  provinces: WilayahOption[];
  initialRegencies: WilayahOption[];
  initialDistricts: WilayahOption[];
  initialVillages: WilayahOption[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateAlamat, null);
  const lastHandledState = useRef<typeof state>(null);

  const [provinceId, setProvinceId] = useState(initial.provinceId);
  const [regencyId, setRegencyId] = useState(initial.regencyId);
  const [districtId, setDistrictId] = useState(initial.districtId);
  const [villageId, setVillageId] = useState(initial.villageId);

  const [regencies, setRegencies] = useState(initialRegencies);
  const [districts, setDistricts] = useState(initialDistricts);
  const [villages, setVillages] = useState(initialVillages);

  useEffect(() => {
    if (state && state !== lastHandledState.current && state.success) {
      lastHandledState.current = state;
      router.refresh();
    }
  }, [state, router]);

  async function handleProvinceChange(nextProvinceId: string) {
    setProvinceId(nextProvinceId);
    setRegencyId("");
    setDistrictId("");
    setVillageId("");
    setDistricts([]);
    setVillages([]);
    setRegencies(nextProvinceId ? await fetchWilayah("regencies", "provinceId", nextProvinceId) : []);
  }

  async function handleRegencyChange(nextRegencyId: string) {
    setRegencyId(nextRegencyId);
    setDistrictId("");
    setVillageId("");
    setVillages([]);
    setDistricts(nextRegencyId ? await fetchWilayah("districts", "regencyId", nextRegencyId) : []);
  }

  async function handleDistrictChange(nextDistrictId: string) {
    setDistrictId(nextDistrictId);
    setVillageId("");
    setVillages(nextDistrictId ? await fetchWilayah("villages", "districtId", nextDistrictId) : []);
  }

  return (
    <form action={formAction} className="admin-request-form">
      <label>
        <span>Nama penerima</span>
        <input name="recipientName" defaultValue={initial.recipientName} required maxLength={100} />
      </label>

      <fieldset>
        <legend>Wilayah</legend>
        <div className="two-col">
          <label>
            <span>Provinsi</span>
            <select name="provinceId" value={provinceId} onChange={(event) => handleProvinceChange(event.target.value)} required>
              <option value="">Pilih provinsi</option>
              {provinces.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Kabupaten/Kota</span>
            <select name="regencyId" value={regencyId} onChange={(event) => handleRegencyChange(event.target.value)} disabled={!provinceId} required>
              <option value="">{provinceId ? "Pilih kabupaten/kota" : "Pilih provinsi dulu"}</option>
              {regencies.map((regency) => (
                <option key={regency.id} value={regency.id}>
                  {regency.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Kecamatan</span>
            <select name="districtId" value={districtId} onChange={(event) => handleDistrictChange(event.target.value)} disabled={!regencyId} required>
              <option value="">{regencyId ? "Pilih kecamatan" : "Pilih kabupaten/kota dulu"}</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Kelurahan/Desa</span>
            <select name="villageId" value={villageId} onChange={(event) => setVillageId(event.target.value)} disabled={!districtId} required>
              <option value="">{districtId ? "Pilih kelurahan/desa" : "Pilih kecamatan dulu"}</option>
              {villages.map((village) => (
                <option key={village.id} value={village.id}>
                  {village.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <label>
        <span>Alamat lengkap</span>
        <textarea name="detailAddress" rows={3} maxLength={500} defaultValue={initial.detailAddress} required />
      </label>

      <div className="two-col">
        <label>
          <span>RT</span>
          <input name="rt" defaultValue={initial.rt} maxLength={4} inputMode="numeric" />
        </label>
        <label>
          <span>RW</span>
          <input name="rw" defaultValue={initial.rw} maxLength={4} inputMode="numeric" />
        </label>
        <label>
          <span>Kode pos</span>
          <input name="postalCode" defaultValue={initial.postalCode} maxLength={5} inputMode="numeric" placeholder="5 digit" />
        </label>
        <label>
          <span>Nomor penerima paket</span>
          <input name="recipientPhone" type="tel" inputMode="tel" defaultValue={initial.recipientPhone} placeholder="08xxxxxxxxxx" />
        </label>
      </div>

      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="admin-success" role="status">
          Tersimpan. Profil kamu {state.completeness?.percent}% lengkap.
        </p>
      ) : null}
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan Alamat"}
      </button>
    </form>
  );
}
