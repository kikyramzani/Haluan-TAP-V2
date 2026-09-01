import { resolveArt } from "../../lib/art-slot";
import RequestSampleClient from "./RequestSampleClient";

/**
 * Pembungkus server yang tipis.
 *
 * Seluruh halaman ini adalah Client Component (form, polling sesi, gerbang
 * akses), tapi slot aset harus dibaca dari sistem berkas, dan `node:fs` tidak
 * ada di browser. Jadi server menyelesaikan path-nya, lalu mengopernya turun.
 */
export default function RequestSamplePage() {
  return <RequestSampleClient art={resolveArt("sample-box")} />;
}
