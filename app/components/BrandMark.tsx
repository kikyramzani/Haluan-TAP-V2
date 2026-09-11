import Image from "next/image";
import { brandInitials, brandLogo } from "../brand-assets";
import { normalizeLogoUrl } from "../../lib/logo-url";

type Props = {
  brand: string;
  /** Logo hasil unggahan admin menang atas aset lokal. */
  logoOverride?: string | null;
  size?: number;
  /** Hanya kartu di atas lipatan pertama yang boleh minta prioritas muat. */
  priority?: boolean;
};

/**
 * Lambang brand. Urutannya: logo dari CMS, lalu aset lokal terkurasi, lalu
 * inisial. Tidak pernah mengambil gambar dari internet secara spekulatif.
 */
export default function BrandMark({ brand, logoOverride, size = 46, priority }: Props) {
  /**
   * logoOverride kini benar-benar berisi Brand.logoUrl (lib/catalog-db.ts),
   * bukan lagi selalu null. Kolom itu input teks bebas di CMS, jadi disaring
   * sekali di sini supaya satu nilai rusak jatuh ke aset lokal alih-alih
   * melempar di tengah render kartu dan menjatuhkan seluruh katalog.
   */
  const logo = normalizeLogoUrl(logoOverride) || brandLogo(brand);

  return (
    <span
      className={`brand-mark${logo ? " has-logo" : ""}`}
      style={size === 46 ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      {logo ? (
        logo.startsWith("data:") ? (
          // Peninggalan CMS lama: sebagian logo tersimpan sebagai data URL, di
          // luar jangkauan next/image. Unggahan baru TIDAK lagi berbentuk ini —
          // lib/image-upload.ts mengembalikan URL https Vercel Blob, yang lewat
          // cabang next/image di bawah.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            width={size}
            height={size}
            style={{ objectFit: "contain", padding: 5 }}
            fetchPriority={priority ? "high" : undefined}
          />
        ) : (
          <Image src={logo} alt="" fill sizes={`${size}px`} style={{ objectFit: "contain" }} priority={priority} />
        )
      ) : (
        brandInitials(brand)
      )}
    </span>
  );
}
