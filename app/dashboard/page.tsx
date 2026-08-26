import Link from "next/link";
import Image from "next/image";
import { requireUser } from "../../lib/auth";
import { listUserSampleRequests } from "../../lib/requests";
import { logoutAction } from "../logout-action";
import ProfileForm from "./ProfileForm";

const actions = [
  { href: "/deals", icon: "↗", label: "Buka katalog", title: "Cari link komisi", copy: "Bandingkan rate Haluan dan pilih deal yang paling cocok untuk kontenmu." },
  { href: "/request-sample", icon: "+", label: "Ajukan sample", title: "Request product sample", copy: "Kirim kebutuhan sample dan pantau statusnya langsung di dashboard." },
  { href: "/dashboard#profile", icon: "→", label: "Lengkapi profil", title: "Naikkan peluang approval", copy: "Tambahkan akun TikTok, niche, followers, GMV, dan data pengiriman." },
];

export default async function CreatorDashboard({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const { error } = await searchParams;
  const user = await requireUser("/dashboard");
  let requests = [] as Awaited<ReturnType<typeof listUserSampleRequests>>;
  try { requests = await listUserSampleRequests(user.id); } catch { requests = []; }
  const profileFields = [user.tiktokUsername || user.shopeeUsername, user.niche, user.followers, user.recipientName, user.address];
  const completeness = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 75 + 25);
  const membershipLabel = user.membership === "verified" ? "MCN terverifikasi" : user.membership === "rejected" ? "Verifikasi perlu diperbaiki" : "Menunggu verifikasi MCN";

  return <main className="creator-app">
    <nav className="creator-topbar shell">
      <Link className="brand" href="/"><Image src="/haluan-logo.png" alt="Haluan Digital Network" width={107} height={35}/><span className="brand-divider"/><strong>TAP</strong></Link>
      <div className="creator-user"><span><b>{user.name}</b><small>{membershipLabel}</small></span><i>{user.name.slice(0,1).toUpperCase()}</i><form action={logoutAction}><button type="submit">Keluar</button></form></div>
    </nav>
    <section className="dashboard-shell shell">
      <aside className="creator-sidebar"><span className="sidebar-label">WORKSPACE</span><a className="active" href="/dashboard"><i>⌂</i> Overview</a><a href="/deals"><i>⌁</i> Link komisi</a><a href="/request-sample"><i>+</i> Request sample</a><a href="#profile"><i>○</i> Profil creator</a>{user.role === "admin" && <a href="/admin"><i>◆</i> Admin</a>}<div className="sidebar-help"><b>Butuh bantuan?</b><p>Tim Haluan siap membantu proses aktivasi akunmu.</p><a href="mailto:hello@haluandigital.agency">Hubungi tim ↗</a></div></aside>
      <div className="creator-content">
        {error === "membership_pending" && <div className="dashboard-alert" role="alert"><b>Request sample belum dapat diajukan.</b><span>Link etalase tetap dapat dibuka. Lengkapi profil agar tim dapat memverifikasi akunmu untuk request sample.</span><a href="#profile">Lengkapi profil →</a></div>}
        {error === "forbidden" && <div className="dashboard-alert" role="alert"><b>Akses admin tidak tersedia.</b><span>Akun ini terdaftar sebagai creator.</span></div>}
        <header className="dashboard-welcome"><div><span className="eyebrow"><span className="live-dot"/> Creator dashboard</span><h1>Halo, <em>{user.name.split(" ")[0]}.</em></h1><p>Satu tempat untuk membuka extra commission, mengajukan sample, dan memantau aktivitas affiliate kamu.</p></div><a href="/deals">Lihat deal aktif <span>↗</span></a></header>
        <div className={`activation-card ${user.membership === "verified" ? "verified" : ""}`}><div className="activation-score">{completeness}<small>%</small></div><div><span>{membershipLabel.toUpperCase()}</span><h2>{user.membership === "verified" ? "Akunmu siap untuk request sample." : "Lengkapi profil untuk mempercepat verifikasi."}</h2><p>{user.membership === "verified" ? "Kamu dapat mengajukan sample dan memantau statusnya dari dashboard." : "Tim Haluan akan mencocokkan akun ini dengan master creator MCN."}</p></div><a href="#profile">{completeness === 100 ? "Perbarui profil" : "Lengkapi sekarang"} →</a></div>
        <section className="dashboard-section"><div className="dashboard-title"><div><span>AKTIVITAS SAMPLE</span><h2>Request terbaru</h2></div><small>{requests.length} request</small></div>{requests.length ? <div className="request-timeline">{requests.slice(0,5).map((item)=><article key={item.id}><div><b>{item.brand}</b><small>{item.id} · {new Date(item.createdAt).toLocaleDateString("id-ID")}</small></div><span className={`status-${item.status}`}>{item.status.replace("_", " ")}</span></article>)}</div> : <div className="dashboard-empty"><b>Belum ada request sample.</b><p>Pilih campaign dengan badge sample, lalu ajukan setelah membership terverifikasi.</p><Link href="/request-sample">Cari sample tersedia →</Link></div>}</section>
        <section className="product-intel"><div className="intel-copy"><span>PRODUCT INTELLIGENCE · WEEKLY</span><h2>Product of the Week</h2><p>Rekomendasi menggabungkan momentum penjualan, pertumbuhan creator, tingkat kompetisi, extra commission TAP, dan kesiapan sample.</p><div className="intel-sources"><b>FastMoss</b><b>Kalodata</b><b>TAP first-party data</b></div></div><div className="intel-score"><div className="intel-lock">⌁</div><span>DATA CONNECTOR</span><strong>Analisis hanya tayang<br/>setelah sumber terverifikasi.</strong><small>TAP tidak mempublikasikan angka estimasi sebagai data penjualan aktual.</small><button type="button" disabled>Coming soon</button></div></section>
        <section className="dashboard-section"><div className="dashboard-title"><div><span>MULAI DARI SINI</span><h2>Apa yang ingin kamu lakukan?</h2></div><small>3 akses utama</small></div><div className="dashboard-actions">{actions.map((item)=><article key={item.title}><i>{item.icon}</i><h3>{item.title}</h3><p>{item.copy}</p><a href={item.href}>{item.label} <span>→</span></a></article>)}</div></section>
        <section className="profile-preview" id="profile"><div><span className="kicker">PROFIL CREATOR</span><h2>Data yang tepat.<br/>Approval lebih cepat.</h2><p>Data performa dipakai untuk matching campaign. Alamat hanya dipakai untuk pengiriman sample.</p></div><ProfileForm user={user}/></section>
      </div>
    </section>
  </main>;
}
