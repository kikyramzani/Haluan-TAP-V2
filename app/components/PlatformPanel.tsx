import PlatformMark from "./PlatformMark";

type Props = {
  tiktokBrands: number;
  tiktokCampaigns: number;
  shopeeBrands: number;
};

/**
 * Konteks platform di samping headline.
 *
 * Tandanya sekarang datang dari PlatformMark: SVG monokrom inline dari Simple
 * Icons, dicatat di BRAND-LOGO-SOURCES.md.
 *
 * Menggantikan probe berkas existsSync ke public/platform/. Mekanisme itu ada
 * karena dulu belum ada tanda platform sama sekali, sehingga panelnya jatuh ke
 * inisial "TT" dan "SH" — dan berkasnya memang tidak pernah masuk. Sekarang
 * tandanya ada di dalam repo, jadi slot itu tidak lagi punya pekerjaan.
 */
export default function PlatformPanel({ tiktokBrands, tiktokCampaigns, shopeeBrands }: Props) {
  const platforms = [
    {
      key: "tiktok" as const,
      name: "TikTok Shop",
      primary: `${tiktokBrands} brand`,
      secondary: `${tiktokCampaigns} campaign aktif`,
    },
    {
      key: "shopee" as const,
      name: "Shopee Affiliate",
      primary: `${shopeeBrands} brand`,
      secondary: "Link, sample, harga live",
    },
  ];

  return (
    <aside className="platform-panel" aria-label="Platform yang tersedia">
      <p className="platform-panel-label">Tersedia di</p>
      <ul>
        {platforms.map((platform) => (
          <li key={platform.key}>
            <span className={`platform-icon platform-icon--${platform.key}`} aria-hidden="true">
              <PlatformMark name={platform.key} />
            </span>
            <span className="platform-body">
              <strong>{platform.name}</strong>
              <span className="platform-primary">{platform.primary}</span>
              <span className="platform-secondary">{platform.secondary}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
