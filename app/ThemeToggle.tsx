"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  // Terang adalah bawaan aplikasi, jadi itu pula tebakan awal sebelum DOM dibaca.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    queueMicrotask(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
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
      <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
    </button>
  );
}
