"use client";

import { useEffect, useState } from "react";
import Icon from "./components/Icon";

type Theme = "dark" | "light";

/** Paper dan ink dari BRAND-SYSTEM.md §2.1, sama dengan viewport di layout.tsx. */
const CHROME_COLOR: Record<Theme, string> = { light: "#fcfcfc", dark: "#090a0a" };

/**
 * Warnai chrome browser sesuai tema yang benar-benar tampil.
 *
 * layout.tsx hanya bisa menyatakan satu nilai statis, dan nilai itu adalah
 * bawaan terang. Tanpa pembaruan ini, creator yang memilih tema gelap
 * mendapat bilah putih di atas aplikasi #090a0a — persis mismatch yang
 * pasangan prefers-color-scheme dulu coba tangani dan justru salah arah.
 */
function syncChromeColor(theme: Theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", CHROME_COLOR[theme]);
}

export default function ThemeToggle() {
  // Terang adalah bawaan aplikasi, jadi itu pula tebakan awal sebelum DOM dibaca.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    queueMicrotask(() => {
      const current: Theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      setTheme(current);
      // Skrip di <head> memulihkan tema tersimpan sebelum paint, jadi warna
      // chrome bisa sudah tertinggal sejak muat pertama, bukan hanya saat
      // toggle ditekan.
      syncChromeColor(current);
    });
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    syncChromeColor(next);
    try {
      window.localStorage.setItem("tap-theme", next);
    } catch {
      // Mode privat bisa menolak penyimpanan. Tema tetap berubah untuk sesi ini.
    }
    setTheme(next);
  }

  const nextLabel = theme === "light" ? "Gunakan tema gelap" : "Gunakan tema terang";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
      aria-pressed={theme === "dark"}
    >
      <Icon name={theme === "light" ? "moon" : "sun"} />
    </button>
  );
}
