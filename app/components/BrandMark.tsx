import Image from "next/image";
import { brandInitials, brandLogo } from "../brand-assets";

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
  const logo = logoOverride || brandLogo(brand);

  return (
    <span
      className={`brand-mark${logo ? " has-logo" : ""}`}
      style={size === 46 ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      {logo ? (
        logo.startsWith("data:") ? (
          // Logo unggahan tersimpan sebagai data URL, di luar jangkauan next/image.
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
