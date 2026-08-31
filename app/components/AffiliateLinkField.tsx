"use client";

import { useId, useState } from "react";
import Icon from "./Icon";

type Props = {
  url: string;
  openUrl: string;
  /** Drawer sudah punya judul sendiri, jadi labelnya bisa disembunyikan. */
  label?: string;
};

/**
 * Link affiliate yang terlihat, bukan tersembunyi di balik tombol.
 *
 * Creator biasanya menempelkan link ini ke aplikasi lain, jadi menyalin harus
 * satu ketukan dan URL-nya tetap kelihatan untuk memastikan mereka menyalin yang
 * benar. Tombol "Ambil link affiliate" tetap ada untuk yang ingin langsung
 * membuka etalasenya.
 */
export default function AffiliateLinkField({ url, openUrl, label }: Props) {
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard bisa ditolak browser. Menyorot teksnya membuat salin manual
      // tetap satu langkah, bukan kegagalan diam-diam.
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }
  }

  return (
    <div className="affiliate-link">
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <div className="affiliate-link-field">
        <input
          id={inputId}
          readOnly
          value={url}
          aria-label={label ?? "Link affiliate"}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={() => void copy()} aria-label={copied ? "Link tersalin" : "Salin link affiliate"}>
          <Icon name={copied ? "check" : "copy"} />
        </button>
      </div>
      <a className="btn btn-primary btn-block" href={openUrl} target="_blank" rel="noopener noreferrer nofollow">
        Ambil link affiliate <Icon name="arrow-up-right" />
      </a>
      {/* Kosong saat diam: teks ajakannya sudah ada di atas field, dan mengulangnya
          di sini membuat halaman terbaca seperti dua instruksi berbeda. Elemennya
          tetap dirender supaya konfirmasi salin diumumkan tanpa menggeser layout. */}
      <p className="affiliate-link-note" role="status">
        {copied ? "Link tersalin ke clipboard." : ""}
      </p>
    </div>
  );
}
