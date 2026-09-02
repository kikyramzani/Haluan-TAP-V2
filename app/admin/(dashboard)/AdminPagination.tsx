import Link from "next/link";
import Icon from "../../components/Icon";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  /** Satuan baris, dipakai apa adanya: "brand", "campaign", "request". */
  unit: string;
  basePath: string;
  /** Filter yang harus ikut terbawa saat pindah halaman. Nilai kosong dibuang. */
  query?: Record<string, string | undefined>;
};

function hrefFor(basePath: string, query: Props["query"], page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) search.set(key, value);
  }
  search.set("page", String(page));
  return `${basePath}?${search.toString()}`;
}

/**
 * Pagination tabel admin, satu tempat untuk ketujuh halaman yang memakainya.
 *
 * Menggantikan pola lama `<Link aria-disabled={page <= 1} href="…page=0">`.
 * Pola itu salah dua kali: aria-disabled hanya mengumumkan "nonaktif" ke
 * pembaca layar sementara tautannya tetap bisa difokus dan diklik, dan tidak
 * ada aturan CSS `.admin-pagination a` sama sekali sehingga tidak ada tanda
 * visual apa pun. Menekan "Sebelumnya" di halaman 1 benar-benar memuat
 * ?page=0, yang lalu dijepit balik ke 1 oleh servernya: satu perjalanan bolak
 * balik penuh yang tidak mengubah apa pun.
 *
 * Di sini ujung rentang dirender sebagai <span>, bukan <a>. Tidak ada tautan
 * berarti tidak ada yang bisa difokus dan tidak ada janji yang dilanggar.
 */
export default function AdminPagination({ page, pageSize, total, unit, basePath, query }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="admin-pagination" aria-label={`Navigasi halaman ${unit}`}>
      {hasPrev ? (
        <Link className="admin-page-link" href={hrefFor(basePath, query, page - 1)} rel="prev">
          <Icon name="arrow-left" /> Sebelumnya
        </Link>
      ) : (
        <span className="admin-page-link is-disabled">
          <Icon name="arrow-left" /> Sebelumnya
        </span>
      )}

      <span className="admin-page-count" aria-live="polite">
        Halaman {page} dari {totalPages} · {total} {unit}
      </span>

      {hasNext ? (
        <Link className="admin-page-link" href={hrefFor(basePath, query, page + 1)} rel="next">
          Berikutnya <Icon name="arrow-right" />
        </Link>
      ) : (
        <span className="admin-page-link is-disabled">
          Berikutnya <Icon name="arrow-right" />
        </span>
      )}
    </nav>
  );
}
