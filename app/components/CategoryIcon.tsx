import { Baby } from "@phosphor-icons/react/dist/ssr/Baby";
import { Barbell } from "@phosphor-icons/react/dist/ssr/Barbell";
import { Couch } from "@phosphor-icons/react/dist/ssr/Couch";
import { DeviceMobile } from "@phosphor-icons/react/dist/ssr/DeviceMobile";
import { ForkKnife } from "@phosphor-icons/react/dist/ssr/ForkKnife";
import { Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { TShirt } from "@phosphor-icons/react/dist/ssr/TShirt";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";

/**
 * Ikon kategori katalog. Pecahan dari Icon.tsx, persis seperti yang komentar
 * berkas itu tetapkan saat petanya menyentuh ambang ~40 entri.
 *
 * Yang dipindah ke sini hanya glyph yang benar-benar cuma dirender di baris chip
 * CampaignCatalog (device-mobile, couch, t-shirt, baby, fork-knife, barbell).
 * `sparkle` dan `tag` tetap ada di Icon.tsx juga karena dipakai di rute lain;
 * impor ganda di sini tidak menambah bundle, sebab tiap glyph Phosphor adalah
 * modul dist/ssr tersendiri yang di-dedupe bundler.
 *
 * Aturan yang sama tetap berlaku: impor dari "dist/ssr/<Nama>" supaya Server
 * Component tidak terpaksa jadi "use client", dan aria-hidden dipasang di sini
 * karena SSRBase milik Phosphor tidak memasangnya sendiri.
 */
const CATEGORY_GLYPH = {
  "Beauty & Health": Sparkle,
  Tech: DeviceMobile,
  "Home & Living": Couch,
  Fashion: TShirt,
  "Mom & Baby": Baby,
  "Food & FMCG": ForkKnife,
  Sports: Barbell,
} as const;

/**
 * Dikunci ke nama kategori persis. Admin bisa menambah kategori kapan saja lewat
 * /admin/kategori, jadi yang tidak dikenal jatuh ke ikon tag generik, bukan
 * ikon kosong, bukan error.
 */
export default function CategoryIcon({ category }: { category: string }) {
  const Glyph = CATEGORY_GLYPH[category as keyof typeof CATEGORY_GLYPH] ?? Tag;
  return <Glyph weight="regular" aria-hidden="true" focusable="false" className="tap-icon" />;
}
