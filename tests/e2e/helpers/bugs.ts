import type { Page } from "@playwright/test";

/**
 * Detektor bug untuk spec perjalanan.
 *
 * Spec perjalanan mengunjungi banyak halaman dan menekan banyak tombol; asersi
 * per langkah menangkap perilaku yang salah, tetapi tidak menangkap halaman
 * yang "berhasil" sambil melempar galat di konsol atau API yang menjawab 500
 * di latar. Detektor ini mengumpulkan ketiganya sepanjang tes, dan spec
 * memeriksa bahwa daftarnya kosong di akhir.
 *
 * Yang diabaikan, dengan sengaja: favicon 404 dan pesan dari @vercel/analytics
 * (di `next start` lokal tanpa env Vercel ia mengeluh, dan itu bukan bug
 * aplikasi).
 */
export function watchForBugs(page: Page) {
  const found: string[] = [];
  const ignore = (text: string) => /favicon|vercel|analytics|ERR_ABORTED/i.test(text);

  page.on("pageerror", (error) => found.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // "Failed to load resource" tidak menyebut URL-nya; 404-nya dicatat lewat
    // response di bawah, lengkap dengan URL, supaya bisa ditelusuri.
    if (/Failed to load resource/.test(text)) return;
    if (!ignore(text)) found.push(`console.error: ${text.slice(0, 200)}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 500) found.push(`HTTP ${response.status()}: ${response.request().method()} ${url}`);
    else if (response.status() === 404 && !ignore(url)) found.push(`HTTP 404: ${response.request().method()} ${url}`);
  });

  return {
    /** Daftar temuan sejauh ini; kosong berarti bersih. */
    findings: () => [...found],
    reset: () => { found.length = 0; },
  };
}
