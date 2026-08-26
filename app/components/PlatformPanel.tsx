import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Props = {
  tiktokBrands: number;
  tiktokCampaigns: number;
  shopeeBrands: number;
};

/**
 * Konteks platform di samping headline.
 *
 * Ikon platform dipasang oleh tim Haluan di `public/platform/`. Keberadaannya
 * diperiksa saat render supaya halaman tidak menampilkan gambar rusak sebelum
 * berkasnya ada — tanpa ikon, panelnya tetap tampil sebagai inisial.
 */
function platformIcon(name: "tiktok" | "shopee") {
  for (const extension of ["png", "webp", "svg", "jpg"]) {
    const file = `/platform/${name}.${extension}`;
    if (existsSync(join(process.cwd(), "public", file))) return file;
  }
  return null;
}

export default function PlatformPanel({ tiktokBrands, tiktokCampaigns, shopeeBrands }: Props) {
  const platforms = [
    {
      key: "tiktok" as const,
      name: "TikTok Shop",
      initials: "TT",
      primary: `${tiktokBrands} brand`,
      secondary: `${tiktokCampaigns} campaign aktif`,
    },
    {
      key: "shopee" as const,
      name: "Shopee Affiliate",
      initials: "SH",
      primary: `${shopeeBrands} brand`,
      secondary: "Link, sample, harga live",
    },
  ];

  return (
    <aside className="platform-panel" aria-label="Platform yang tersedia">
      <p className="platform-panel-label">Tersedia di</p>
      <ul>
        {platforms.map((platform) => {
          const icon = platformIcon(platform.key);
          return (
            <li key={platform.key}>
              <span className={`platform-icon${icon ? " has-icon" : ""}`} aria-hidden="true">
                {icon ? (
                  <Image src={icon} alt="" width={44} height={44} />
                ) : (
                  platform.initials
                )}
              </span>
              <span className="platform-body">
                <strong>{platform.name}</strong>
                <span className="platform-primary">{platform.primary}</span>
                <span className="platform-secondary">{platform.secondary}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
