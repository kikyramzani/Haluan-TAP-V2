import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return <main className="system-state"><Link className="brand" href="/" aria-label="Haluan TAP, ke beranda"><Image src="/haluan-logo.png" alt="" width={107} height={35}/><strong>TAP</strong></Link><span>404 · LOST SIGNAL</span><h1>Halaman tidak ditemukan.</h1><p>Link yang kamu buka mungkin sudah berpindah atau campaign-nya tidak tersedia.</p><div><Link href="/deals">Lihat deal aktif</Link><Link href="/">Kembali ke home</Link></div></main>;
}

