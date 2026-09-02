"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Label istirahat, mis. "Hapus". */
  children: string;
  /** Label setelah dipersenjatai, mis. "Ya, hapus". Sebutkan akibatnya. */
  confirmLabel: string;
  /** Label saat server action berjalan. */
  pendingLabel?: string;
  pending?: boolean;
  className?: string;
  disabled?: boolean;
  /**
   * Untuk aksi yang bukan pengiriman formulir (mis. aksi massal berbasis
   * useTransition). Bila diisi, tombol bersenjata memanggil ini alih-alih
   * mengirim formulir induknya.
   */
  onConfirm?: () => void;
};

/** Lupa membatalkan itu wajar; melupakan tombol bersenjata selamanya tidak. */
const DISARM_AFTER_MS = 8000;

/**
 * Konfirmasi dua langkah untuk aksi yang merusak.
 *
 * Sebelum ini tidak ada satu pun konfirmasi di seluruh /admin: penggabungan
 * brand (yang salinannya sendiri menyebut "tidak bisa dibatalkan otomatis"),
 * penghapusan kategori, pengarsipan massal, dan penurunan peran semuanya
 * berjalan pada klik pertama.
 *
 * Dua langkah inline, bukan window.confirm atau <dialog>: dialog memindahkan
 * fokus keluar dari baris tabel yang sedang dibaca, sementara langkah kedua di
 * tempat yang sama menjaga konteks barisnya tetap terlihat. Tombol istirahat
 * bertipe "button" sehingga klik pertama tidak mungkin mengirim formulir;
 * hanya tombol bersenjata yang bertipe "submit".
 */
export default function ConfirmButton({
  children,
  confirmLabel,
  pendingLabel,
  pending,
  className,
  disabled,
  onConfirm,
}: Props) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!armed) return;
    // Pindahkan fokus ke tombol kedua supaya pengguna keyboard tidak perlu
    // menebak ke mana tombol yang baru saja mereka tekan menghilang.
    confirmRef.current?.focus();
    const timer = setTimeout(() => setArmed(false), DISARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  if (pending) {
    return (
      <button className={className} type="submit" disabled>
        {pendingLabel ?? "Memproses…"}
      </button>
    );
  }

  if (!armed) {
    return (
      <button className={className} type="button" disabled={disabled} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }

  return (
    <span className="confirm-pair">
      <button
        ref={confirmRef}
        className={`${className ?? ""} is-armed`.trim()}
        type={onConfirm ? "button" : "submit"}
        onClick={
          onConfirm
            ? () => {
                setArmed(false);
                onConfirm();
              }
            : undefined
        }
      >
        {confirmLabel}
      </button>
      <button className="confirm-cancel" type="button" onClick={() => setArmed(false)}>
        Batal
      </button>
    </span>
  );
}
