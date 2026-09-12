import Icon from "./Icon";
import type { IconName } from "./Icon";

/**
 * Kisi fitur bergaris putus-putus, dengan pola kisi samar di sudut tiap sel.
 *
 * Diadaptasi dari komponen shadcn/Tailwind "grid-feature-cards". Proyek ini
 * tidak memakai Tailwind maupun shadcn — 7.900 baris CSS tulisan tangan, token
 * di tokens.css, dan BRAND-SYSTEM.md sebagai sumber kebenaran di atasnya — jadi
 * yang diambil bentuknya, bukan kelasnya: `text-foreground/75` jadi
 * --text-muted, `border-dashed` jadi --line, dan ikon lewat Icon.tsx (Phosphor)
 * alih-alih lucide-react.
 *
 * SATU perbedaan perilaku yang disengaja: pola kotaknya DITURUNKAN dari indeks
 * kartu, bukan dari Math.random() seperti aslinya. Komponen asli menandai
 * dirinya "use client"; di sini ia dirender dari app/page.tsx yang Server
 * Component, dan Math.random() saat render menghasilkan kotak yang berbeda di
 * server dan di klien — hydration mismatch yang tidak pernah terlihat sebagai
 * galat, hanya sebagai pola yang berkedip berganti saat halaman selesai dimuat.
 * Variasinya tetap ada, hanya saja stabil.
 */

export type Feature = {
  title: string;
  description: string;
  icon: IconName;
};

/**
 * Pengganti deterministik untuk genRandomPattern(). Angka pengalinya sekadar
 * bilangan ganjil yang saling asing supaya kedua sumbu tidak bergerak seirama
 * dan polanya tidak terbaca berulang antar kartu.
 */
function patternFor(index: number): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, step) => {
    const seed = index * 17 + step * 29;
    return [7 + (seed % 4), 1 + ((seed * 3) % 6)] as [number, number];
  });
}

function GridPattern({ index }: { index: number }) {
  const patternId = `feature-grid-${index}`;
  const size = 20;

  return (
    <svg className="feature-pattern" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={patternId} width={size} height={size} patternUnits="userSpaceOnUse" x="-12" y="4">
          <path d={`M.5 ${size}V.5H${size}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      <svg x="-12" y="4" className="feature-pattern-squares">
        {patternFor(index).map(([x, y], step) => (
          <rect key={step} strokeWidth={0} width={size + 1} height={size + 1} x={x * size} y={y * size} />
        ))}
      </svg>
    </svg>
  );
}

export default function FeatureGrid({ features }: { features: readonly Feature[] }) {
  return (
    <div className="feature-grid">
      {features.map((feature, index) => (
        <article className="feature-cell" key={feature.title}>
          {/* Lapisan pola duduk di bawah teks dan tidak pernah mencegat ketukan. */}
          <span className="feature-pattern-layer" aria-hidden="true">
            <GridPattern index={index} />
          </span>
          <i className="feature-icon">
            <Icon name={feature.icon} />
          </i>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
        </article>
      ))}
    </div>
  );
}
