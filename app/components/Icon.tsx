import type { Icon as PhosphorIcon, IconProps } from "@phosphor-icons/react";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { LinkSimple } from "@phosphor-icons/react/dist/ssr/LinkSimple";
import { Megaphone } from "@phosphor-icons/react/dist/ssr/Megaphone";
import { BookmarkSimple } from "@phosphor-icons/react/dist/ssr/BookmarkSimple";
import { ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { Copy } from "@phosphor-icons/react/dist/ssr/Copy";
import { CrownSimple } from "@phosphor-icons/react/dist/ssr/CrownSimple";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import { Fire } from "@phosphor-icons/react/dist/ssr/Fire";
import { Gift } from "@phosphor-icons/react/dist/ssr/Gift";
import { House } from "@phosphor-icons/react/dist/ssr/House";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Percent } from "@phosphor-icons/react/dist/ssr/Percent";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SignIn } from "@phosphor-icons/react/dist/ssr/SignIn";
import { Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Star } from "@phosphor-icons/react/dist/ssr/Star";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { UserCircle } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import { X } from "@phosphor-icons/react/dist/ssr/X";

/**
 * Satu-satunya tempat di repo ini yang boleh mengimpor @phosphor-icons/react.
 *
 * Selalu lewat "dist/ssr/<Nama>", tidak pernah dari entry utama: entry utama
 * memakai IconContext, jadi mengimpornya di Server Component (app/page.tsx,
 * app/dashboard/page.tsx, dll.) memaksa file itu jadi "use client". Versi ssr
 * tidak punya context dan hanya menarik satu ikon per impor, sehingga barrel
 * file-nya tidak pernah masuk bundle.
 *
 * Komponen SSRBase milik Phosphor TIDAK memasang aria-hidden. Tanpa pembungkus
 * ini, setiap ikon jadi elemen yang dibacakan pembaca layar. Masalah yang sama
 * dengan glyph Unicode yang digantikannya, hanya berpindah bentuk.
 *
 * Ukuran default Phosphor adalah 1em, jadi ukuran ikon diatur lewat font-size
 * induknya (token --icon-sm/md/lg/xl), bukan prop size. Aturan CSS lama yang
 * menyetel font-size untuk ikon lama tetap berlaku tanpa diubah.
 *
 * Pemecahan yang dulu direncanakan di sini SUDAH dilakukan: enam glyph kategori
 * (device-mobile, couch, t-shirt, baby, fork-knife, barbell) pindah ke
 * CategoryIcon.tsx karena hanya dirender di baris chip CampaignCatalog,
 * sedangkan berkas ini ikut tertarik ke bundle bersama hampir semua rute.
 * `sparkle`, `tag`, `squares-four`, dan `percent` tetap di sini karena dipakai
 * rute lain juga.
 *
 * Peta ini sekarang 36 entri. Ambang ~40 tetap berlaku: kalau tercapai lagi,
 * kandidat pecahan berikutnya adalah glyph khusus admin.
 */
const GLYPHS = {
  "arrow-clockwise": ArrowClockwise,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  "bookmark-simple": BookmarkSimple,
  "chart-line-up": ChartLineUp,
  check: Check,
  "clipboard-text": ClipboardText,
  copy: Copy,
  "crown-simple": CrownSimple,
  eye: Eye,
  "eye-slash": EyeSlash,
  fire: Fire,
  gift: Gift,
  house: House,
  "link-simple": LinkSimple,
  "magnifying-glass": MagnifyingGlass,
  megaphone: Megaphone,
  moon: Moon,
  package: Package,
  percent: Percent,
  "shield-check": ShieldCheck,
  "sign-in": SignIn,
  sparkle: Sparkle,
  "squares-four": SquaresFour,
  star: Star,
  /**
   * Bintang terisi punya entri sendiri, bukan lewat prop `variant`. Isian di
   * sini berarti "sudah disimpan" (status), sedangkan `variant="solid"` khusus
   * menandai tab navigasi aktif (hierarki). Memisahkannya menjaga aturan
   * "isian hanya menyatakan satu tingkat hierarki" tetap benar.
   */
  "star-fill": Star,
  storefront: Storefront,
  sun: Sun,
  tag: Tag,
  "trend-up": TrendUp,
  "user-circle": UserCircle,
  users: Users,
  x: X,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof GLYPHS;

type Props = Omit<IconProps, "weight"> & {
  name: IconName;
  /**
   * Isian (`solid`) hanya untuk tab navigasi bawah yang sedang aktif. Tidak ada
   * tempat lain di TAP yang boleh memakainya. Lihat catatan "star-fill".
   */
  variant?: "outline" | "solid";
};

export default function Icon({ name, variant = "outline", className, ...rest }: Props) {
  const Glyph = GLYPHS[name];
  const solid = variant === "solid" || name === "star-fill";

  return (
    <Glyph
      weight={solid ? "fill" : "regular"}
      aria-hidden="true"
      focusable="false"
      className={className ? `tap-icon ${className}` : "tap-icon"}
      {...rest}
    />
  );
}
