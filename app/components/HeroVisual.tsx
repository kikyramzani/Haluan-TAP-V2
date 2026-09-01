import Image from "next/image";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Parallax from "./Parallax";
import PlatformPanel from "./PlatformPanel";

type Props = {
  tiktokBrands: number;
  tiktokCampaigns: number;
  shopeeBrands: number;
};

const CANDIDATES = ["png", "webp", "avif", "jpg"];

/**
 * Konteks visual di samping headline.
 *
 * Gambarnya dipasang tim Haluan di `public/hero/`. Keberadaannya diperiksa saat
 * render, dan selama berkasnya belum ada halaman ini kembali memakai panel
 * "Tersedia di", jadi kolom kanan hero tidak pernah kosong dan tidak pernah
 * menampilkan gambar rusak.
 */
function heroImage() {
  for (const extension of CANDIDATES) {
    const file = `/hero/creator-mascot.${extension}`;
    if (existsSync(join(process.cwd(), "public", file))) return file;
  }
  return null;
}

export default function HeroVisual({ tiktokBrands, tiktokCampaigns, shopeeBrands }: Props) {
  const image = heroImage();
  if (!image) {
    return (
      <PlatformPanel tiktokBrands={tiktokBrands} tiktokCampaigns={tiktokCampaigns} shopeeBrands={shopeeBrands} />
    );
  }

  return (
    <Parallax className="hero-visual">
      {/*
        `alt` sengaja kosong: gambarnya dekoratif. Isi yang dibawanya. TikTok
        Shop dan Shopee. Sudah dinyatakan sebagai teks di headline dan di proof
        bar, jadi mendeskripsikannya lagi hanya menambah kebisingan bagi
        pengguna pembaca layar.

        `priority` karena ini kandidat LCP halaman depan, dan dimensinya ditulis
        eksplisit supaya tidak ada pergeseran layout saat gambarnya tiba.
      */}
      <Image src={image} alt="" width={944} height={823} priority sizes="(max-width: 900px) 78vw, 420px" />
    </Parallax>
  );
}
