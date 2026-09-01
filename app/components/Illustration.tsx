/**
 * Ilustrasi vektor untuk permukaan publik.
 *
 * Digambar di sini, bukan diunduh: aset stok akan membuat halaman terlihat
 * seperti template, dan BRAND-SYSTEM.md §1 ("Praktis") menuntut gambar yang
 * BEKERJA. Menjelaskan sesuatu, bukan mengisi ruang. Setiap adegan di bawah
 * menggambarkan hal yang memang sedang dibicarakan halamannya.
 *
 * Semuanya memakai `currentColor` dan token brand lewat CSS custom property,
 * jadi ikut berbalik sendiri di tema gelap tanpa berkas kedua. Tidak ada
 * gradasi: §3.4 membatasi satu Haluan Hot per viewport, dan ilustrasi bukan
 * tempat menghabiskan jatah itu.
 *
 * `aria-hidden` karena dekoratif. Setiap adegan selalu didampingi judul dan
 * paragraf yang menyatakan hal yang sama sebagai teks.
 */

type Scene = "empty" | "sample" | "signup" | "join" | "exclusive";

type Props = {
  scene: Scene;
  className?: string;
};

/** Stroke 2px konsisten, sudut membulat. Sejalan dengan geometri Poppins. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Empty() {
  return (
    <>
      {/* Rak tiga kolom: dua terisi, satu kosong. Persis keadaan "tidak ketemu". */}
      <rect x="14" y="26" width="46" height="38" rx="6" {...stroke} opacity="0.35" />
      <rect x="70" y="26" width="46" height="38" rx="6" {...stroke} opacity="0.35" />
      <rect x="126" y="26" width="46" height="38" rx="6" {...stroke} />
      <path d="M24 46h26M24 55h16" {...stroke} opacity="0.35" />
      <path d="M80 46h26M80 55h16" {...stroke} opacity="0.35" />
      <line x1="70" y1="76" x2="116" y2="76" {...stroke} opacity="0.35" />
      <line x1="14" y1="76" x2="60" y2="76" {...stroke} opacity="0.35" />
      <line x1="126" y1="76" x2="172" y2="76" {...stroke} />
      {/* Kaca pembesar menyorot slot yang kosong. */}
      <circle cx="149" cy="45" r="13" fill="none" stroke="var(--brand-magenta)" strokeWidth="2.5" />
      <line
        x1="158"
        y1="54"
        x2="167"
        y2="63"
        stroke="var(--brand-magenta)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  );
}

function Sample() {
  return (
    <>
      {/* Kardus terbuka. Barang yang dikirim ke creator. */}
      <path d="M30 52v30a4 4 0 0 0 4 4h56a4 4 0 0 0 4-4V52" {...stroke} />
      <path d="M24 38h76v14H24z" {...stroke} />
      <line x1="62" y1="38" x2="62" y2="86" {...stroke} opacity="0.4" />
      {/* Tutup terbuka ke belakang. */}
      <path d="M28 38 40 24h44l12 14" {...stroke} opacity="0.5" />
      {/* Kartu konten yang keluar dari kardus: hasil dari sample-nya. */}
      <rect
        x="108"
        y="28"
        width="46"
        height="58"
        rx="6"
        fill="none"
        stroke="var(--brand-magenta)"
        strokeWidth="2.5"
      />
      <path
        d="M126 48l12 8-12 8z"
        fill="var(--brand-magenta)"
        stroke="none"
      />
      <path d="M116 74h30" stroke="var(--brand-magenta)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </>
  );
}

function Signup() {
  return (
    <>
      {/* Kartu profil creator. Akun yang baru dibuat. */}
      <rect x="16" y="26" width="66" height="58" rx="8" {...stroke} />
      <circle cx="49" cy="46" r="9" {...stroke} />
      <path d="M35 68c0-8 6-12 14-12s14 4 14 12" {...stroke} />

      {/* Panah: akun membuka akses. */}
      <path d="M94 55h20" {...stroke} opacity="0.5" />
      <path d="M108 49l6 6-6 6" {...stroke} opacity="0.5" />

      {/* Label deal dengan tanda persen. Yang didapat setelah punya akun. */}
      <path
        d="M128 32h34a6 6 0 0 1 6 6v20l-19 20-27-27V38a6 6 0 0 1 6-6z"
        fill="none"
        stroke="var(--brand-magenta)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="155" cy="45" r="3.5" fill="var(--brand-magenta)" stroke="none" />
      <path
        d="M136 62l14-14"
        stroke="var(--brand-magenta)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="137" cy="49" r="3" fill="none" stroke="var(--brand-magenta)" strokeWidth="2" />
      <circle cx="149" cy="61" r="3" fill="none" stroke="var(--brand-magenta)" strokeWidth="2" />
    </>
  );
}

function Join() {
  return (
    <>
      {/*
        Digambar seluruhnya dengan currentColor. Tidak ada --brand-magenta di
        sini seperti adegan lain. Adegan ini tampil DI ATAS gradasi magenta join
        banner, jadi aksen magenta akan hilang, dan menambah gradasi kedua
        melanggar batas satu Haluan Hot per viewport (BRAND-SYSTEM.md §3.4).
      */}

      {/* Kartu deal utama dengan tanda persen. Inti tawarannya. */}
      <rect x="24" y="34" width="78" height="58" rx="10" {...stroke} strokeWidth={2.5} />
      <circle cx="45" cy="52" r="5" {...stroke} />
      <circle cx="81" cy="74" r="5" {...stroke} />
      <path d="M84 48 42 78" {...stroke} strokeWidth={2.5} />

      {/* Kartu kedua melayang di belakang: deal yang tidak tersedia di open plan. */}
      <rect x="112" y="22" width="56" height="42" rx="8" {...stroke} opacity="0.55" />
      <path d="M122 50l10-10 8 7 12-15" {...stroke} opacity="0.55" />

      {/* Panah naik: rate yang bergerak setelah bergabung. */}
      <path d="M116 92l16-14 12 10 20-22" {...stroke} strokeWidth={2.5} />
      <path d="M156 66h10v10" {...stroke} strokeWidth={2.5} />
    </>
  );
}

function Exclusive() {
  return (
    <>
      {/*
        Gembok terbuka di samping kartu deal. "deal yang tidak ada di open plan".
        Seluruhnya currentColor: adegan ini tampil di atas isian magenta solid,
        jadi aksen --brand-magenta akan hilang di sana. Sengaja BUKAN memakai
        ulang adegan `join`, supaya kartu unggulan dan join banner tidak terlihat
        sebagai blok yang sama.
      */}
      <rect x="24" y="30" width="84" height="62" rx="10" {...stroke} strokeWidth={2.5} />
      <path d="M40 54h46M40 68h30" {...stroke} opacity="0.6" />

      {/* Badan gembok. */}
      <rect x="118" y="52" width="52" height="40" rx="8" {...stroke} strokeWidth={2.5} />
      {/* Sengkang terbuka: kakinya hanya satu, tidak menutup kembali ke badan. */}
      <path d="M130 52V40a14 14 0 0 1 26-6" {...stroke} strokeWidth={2.5} />
      <circle cx="144" cy="68" r="5" {...stroke} />
      <path d="M144 73v7" {...stroke} />

      {/* Kilau kecil: penanda "khusus", bukan hiasan acak. */}
      <path d="M103 16l3.2 6.8 6.8 3.2-6.8 3.2-3.2 6.8-3.2-6.8-6.8-3.2 6.8-3.2z" {...stroke} opacity="0.75" />
    </>
  );
}

/**
 * viewBox per adegan, bukan satu ukuran untuk semuanya: tiap adegan menggambar
 * di rentang koordinat yang berbeda, dan viewBox seragam menyisakan bidang
 * kosong yang berbeda-beda di tiap gambar. Hasilnya ilustrasi terlihat melayang
 * dan tidak sejajar satu sama lain. Angka di bawah adalah kotak isi tiap adegan
 * plus margin 6 unit.
 */
const SCENES: Record<Scene, { viewBox: string; Render: () => React.JSX.Element }> = {
  empty: { viewBox: "8 20 170 62", Render: Empty },
  sample: { viewBox: "18 18 142 74", Render: Sample },
  signup: { viewBox: "10 20 166 70", Render: Signup },
  join: { viewBox: "18 16 156 82", Render: Join },
  exclusive: { viewBox: "18 10 158 88", Render: Exclusive },
};

export default function Illustration({ scene, className }: Props) {
  const { viewBox, Render } = SCENES[scene];
  return (
    <svg
      viewBox={viewBox}
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className ? `illustration ${className}` : "illustration"}
    >
      <Render />
    </svg>
  );
}
