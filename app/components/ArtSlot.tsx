import Image from "next/image";
import Illustration from "./Illustration";

type Props = {
  /**
   * Hasil `resolveArt()` dari server. `null` berarti belum ada aset dan vektor
   * yang dipakai. Sengaja prop, bukan pencarian berkas di dalam komponen ini,
   * supaya komponen tetap aman dirender dari Client Component juga.
   */
  src: string | null;
  /** Vektor yang tampil selama slot-nya masih kosong. */
  scene: React.ComponentProps<typeof Illustration>["scene"];
  className?: string;
  /**
   * Kosong secara default: gambar di slot ini selalu mendampingi judul dan
   * paragraf yang sudah menyatakan isinya sebagai teks. Diisi hanya kalau
   * gambarnya membawa informasi yang tidak ada di teks mana pun.
   */
  alt?: string;
  width?: number;
  height?: number;
};

/**
 * Menampilkan aset asli kalau tim sudah menaruhnya di public/art/, dan vektor
 * kalau belum. Tanpa perubahan kode di antara keduanya.
 *
 * Dimensi ditulis eksplisit supaya tidak ada pergeseran layout saat aset yang
 * sesungguhnya datang. Angka default 640×480 hanya rasio penampung; berkas yang
 * lebih besar tetap diperkecil oleh CSS `max-width`.
 */
export default function ArtSlot({ src, scene, className, alt = "", width = 640, height = 480 }: Props) {
  if (!src) return <Illustration scene={scene} className={className} />;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className ? `page-art ${className}` : "page-art"}
      sizes="(max-width: 900px) 80vw, 420px"
    />
  );
}
