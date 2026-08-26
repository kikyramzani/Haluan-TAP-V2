import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-about">
            <strong style={{ fontFamily: "var(--font-display)", letterSpacing: "0.14em" }}>TAP</strong>
            <p>
              Campaign platform Haluan Digital Agency. Satu tempat untuk melihat brand yang sedang buka peluang creator.
            </p>
          </div>

          <div className="footer-col">
            <h3>Campaign</h3>
            <ul>
              <li>
                <Link href="/deals">Semua campaign</Link>
              </li>
              <li>
                <Link href="/deals?platform=shopee">Shopee Affiliate</Link>
              </li>
              <li>
                <Link href="/request-sample">Request sample</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h3>Creator</h3>
            <ul>
              <li>
                <Link href="/daftar">Gabung creator</Link>
              </li>
              <li>
                <Link href="/daftar?mode=login">Masuk</Link>
              </li>
              <li>
                <Link href="/dashboard">Dashboard</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-legal">
          <span>© {new Date().getFullYear()} Haluan Digital Network</span>
          <span style={{ display: "flex", gap: "var(--space-4)" }}>
            <Link href="/privacy">Privasi</Link>
            <Link href="/terms">Ketentuan</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
