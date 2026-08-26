"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Perpindahan maksimum dalam piksel, dihitung dari titik tengah viewport. */
  distance?: number;
  className?: string;
};

/**
 * Lapisan parallax yang hanya bekerja saat benar-benar terlihat.
 *
 * Tiga hal yang dijaga di sini:
 *
 * - Listener scroll baru dipasang setelah IntersectionObserver bilang elemennya
 *   masuk layar, dan dilepas begitu keluar. Halaman ini panjang; tanpa gerbang
 *   itu, hero tetap menghitung posisi sepanjang sisa halaman.
 * - Penulisan gaya ditunda ke `requestAnimationFrame`, jadi banyak event scroll
 *   dalam satu frame hanya menghasilkan satu penulisan.
 * - Yang dianimasikan hanya `transform`, properti yang tidak memicu layout.
 *
 * Saat pengguna meminta gerak dikurangi, tidak ada listener yang dipasang sama
 * sekali dan isinya dirender diam.
 */
export default function Parallax({ children, distance = 28, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let listening = false;

    const apply = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      // −1 saat elemen ada di bawah layar, +1 saat sudah di atas layar.
      const progress = (viewport / 2 - (box.top + box.height / 2)) / viewport;
      const offset = Math.max(-1, Math.min(1, progress)) * distance;
      element.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const start = () => {
      if (listening || motionQuery.matches) return;
      listening = true;
      element.style.willChange = "transform";
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };

    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      // Dilepas supaya browser tidak menahan lapisan komposit untuk elemen
      // yang sudah tidak bergerak.
      element.style.willChange = "";
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) start();
        else stop();
      }
    });
    observer.observe(element);

    // Mengubah preferensi gerak di tengah sesi langsung berlaku, tanpa reload.
    const onMotionChange = () => {
      if (motionQuery.matches) {
        stop();
        element.style.transform = "";
      } else {
        start();
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      stop();
    };
  }, [distance]);

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
