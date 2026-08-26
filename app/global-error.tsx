"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="id"><body><main className="system-state"><span>TAP · RECOVERY</span><h1>Ada gangguan sementara.</h1><p>Data kamu tetap aman. Muat ulang bagian ini atau kembali ke halaman utama.</p><div><button type="button" onClick={reset}>Coba lagi</button><Link href="/">Kembali ke home</Link></div></main></body></html>;
}
