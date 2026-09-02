import Link from "next/link";
import BrandLogo from "./components/BrandLogo";

export default function NotFound() {
  return <main className="system-state"><Link className="brand" href="/" aria-label="Haluan TAP, ke beranda"><BrandLogo /></Link><span>404 · LOST SIGNAL</span><h1>Halaman tidak ditemukan.</h1><p>Link yang kamu buka mungkin sudah berpindah atau campaign-nya tidak tersedia.</p><div><Link href="/deals">Lihat deal aktif</Link><Link href="/">Kembali ke home</Link></div></main>;
}

