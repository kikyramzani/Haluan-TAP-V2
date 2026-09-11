"use client";

import { useRef, useState, useTransition } from "react";
import { uploadBrandLogo } from "./actions";

/**
 * The logoUrl text input stays the source of truth BrandForm submits (name="logoUrl"),
 * this just offers a second way to fill it. Typing a path/URL directly still works exactly
 * as before, for existing migrated logos.
 */

/**
 * Logo tidak pernah dirender lebih besar dari 64px (app/components/BrandMark.tsx),
 * sementara foto ponsel datang pada 4000px dan 3-5MB. Mengecilkannya di peramban
 * membuat yang melintas ~60KB, jadi batas body Server Action tidak lagi jadi
 * penentu — batas itu tetap dinaikkan di next.config.ts sebagai jaring untuk
 * berkas yang gagal diperkecil di sini.
 */
const MAX_EDGE = 512;

/**
 * Gagal diam-diam dan mengembalikan berkas aslinya. Peramban yang tidak bisa
 * mendekode (HEIC di Chrome, misalnya) tetap boleh mencoba mengunggah, dan
 * SERVER yang memberi alasan yang benar — di sini tidak ada validasi, hanya
 * kenyamanan. Format keluarannya JPEG karena itu yang paling luas didukung
 * toBlob; server toh mengubahnya lagi jadi WebP.
 */
async function downscale(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^./]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function LogoUploadField({ defaultValue }: { defaultValue?: string | null }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("file", await downscale(file));
        const result = await uploadBrandLogo(formData);
        if ("error" in result) setError(result.error);
        else setUrl(result.url);
      } catch {
        /**
         * uploadBrandLogo bisa MELEMPAR, bukan hanya mengembalikan { error }:
         * body di atas bodySizeLimit ditolak Next sebelum action-nya jalan, dan
         * requireAdmin() memanggil redirect() saat sesi admin sudah habis.
         * Tanpa penangkap ini keduanya jadi unhandled rejection — yang dilihat
         * admin cuma pemilih berkas yang kosong lagi, tanpa keterangan apa pun.
         */
        setError("Upload gagal. Coba file yang lebih kecil, atau muat ulang halaman kalau sesi admin sudah habis.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  return (
    <label>
      <span>Logo (path/URL, atau unggah file)</span>
      {/* inputMode/autoCapitalize/autoCorrect: papan ketik ponsel meng-kapital
          dan mengoreksi otomatis field tanpa tipe, jadi path seperti
          "/brand-logos/nama-brand.webp" berubah bentuk saat diketik. */}
      <input
        name="logoUrl"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="/brand-logos/nama-brand.webp"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <input className="file-input" ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={pending} />
      {pending ? <small>Mengunggah…</small> : null}
      {/* Pratinjau: sebelumnya unggahan hanya menghasilkan teks URL, dan admin
          baru tahu logonya benar atau tidak setelah menyimpan lalu membuka
          katalog. <img> biasa, bukan next/image — nilainya teks bebas yang
          sedang diketik, dan host yang tidak terdaftar akan melempar di dalam
          form. */}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="logo-preview" src={url} alt="" width={48} height={48} />
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}
