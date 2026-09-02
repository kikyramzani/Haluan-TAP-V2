"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "../../components/Icon";
import BrandLogo from "../../components/BrandLogo";

type AuthMode = "login" | "verify" | "forgot" | "reset";

/**
 * Login khusus admin: hanya email + kata sandi, tanpa tab daftar, tanpa Google,
 * dan tanpa naskah promosi creator. Endpoint yang dipanggil sama persis dengan
 * /daftar (lib/auth.ts tidak punya jalur "daftar jadi admin" tersendiri. Status
 * admin ditentukan lewat allowlist email saat login/register manapun), jadi
 * satu-satunya yang beda di sini adalah tampilannya.
 */
export default function AdminAuthClient({ emailVerificationEnabled }: { emailVerificationEnabled: boolean }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const timer = window.setTimeout(() => {
      if (error === "system_unavailable") setNotice("Sistem akun sedang tidak tersedia. Silakan coba kembali beberapa saat lagi.");
      if (error === "forbidden") setNotice("Akun ini belum terdaftar sebagai admin.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : mode === "verify" ? "/api/auth/verify/confirm" : mode === "forgot" ? "/api/auth/verify/request" : "/api/auth/password/reset";
      const body = mode === "forgot" ? { ...values, purpose: "reset" } : mode === "verify" || mode === "reset" ? { ...values, challengeId, code, returnTo: "/admin" } : { ...values, returnTo: "/admin" };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok && mode === "login" && payload.verificationRequired) {
        const email = String(values.email || "");
        const verificationResponse = await fetch("/api/auth/verify/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, purpose: "verify", continuation: payload.continuation }),
        });
        const verification = await verificationResponse.json();
        if (!verificationResponse.ok) throw new Error(verification.error || "Kode verifikasi belum dapat dikirim.");
        setAuthEmail(email);
        setChallengeId(verification.challengeId);
        setCode(verification.debugCode || "");
        setMode("verify");
        setNotice("Akun ditemukan. Masukkan kode yang baru dikirim ke email kamu.");
        setBusy(false);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Autentikasi gagal.");
      if (mode === "forgot") {
        setAuthEmail(String(values.email || ""));
        if (!payload.challengeId) {
          setNotice("Jika email terdaftar, kode reset sudah dikirim.");
          setBusy(false);
          return;
        }
        setChallengeId(payload.challengeId);
        setCode(payload.debugCode || "");
        setMode("reset");
        setNotice("Masukkan kode dari email dan kata sandi baru.");
        setBusy(false);
        return;
      }
      if (payload.signedIn === false) {
        setCode("");
        setMode("login");
        setNotice(payload.notice || "Perubahan kamu sudah tersimpan. Masuk untuk melanjutkan.");
        setBusy(false);
        return;
      }
      window.location.assign(payload.returnTo || "/admin");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Autentikasi gagal."); setBusy(false); }
  }

  return (
    <main className="auth-main">
      <nav className="nav shell auth-nav">
        <Link className="brand" href="/" aria-label="Haluan TAP, ke beranda"><BrandLogo /></Link>
        <Link className="back-link" href="/"><Icon name="arrow-left" /> Kembali ke home</Link>
      </nav>

      <section className="auth-page shell">
        <div className="auth-context">
          <span className="eyebrow"><span className="live-dot" /> Admin access</span>
          <h1>Panel <em>internal</em> TAP.</h1>
          <p>Khusus tim Haluan yang mengelola katalog, brand, dan permintaan sample. Bukan halaman pendaftaran creator.</p>
        </div>

        <div className="auth-card">
          <div className="auth-heading">
            <span>{mode === "login" ? "MASUK ADMIN" : mode === "verify" ? "VERIFIKASI EMAIL" : "PULIHKAN AKUN"}</span>
            <h2>{mode === "login" ? "Masuk ke panel admin." : mode === "verify" ? "Cek email kamu." : mode === "forgot" ? "Atur ulang kata sandi." : "Buat kata sandi baru."}</h2>
            <p>{mode === "login" ? "Gunakan email yang sudah terdaftar di allowlist admin." : mode === "verify" ? `Masukkan kode enam digit yang dikirim ke ${authEmail}.` : mode === "forgot" ? "Kami akan mengirim kode reset jika email terdaftar." : `Masukkan kode yang dikirim ke ${authEmail}.`}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {(mode === "login" || mode === "forgot") && <label><span>Email</span><input key={`email-${mode}`} name="email" type="email" autoComplete="email" defaultValue={mode === "login" ? authEmail : ""} placeholder="nama@haluan.digital" required /></label>}
            {(mode === "verify" || mode === "reset") && <label><span>Kode enam digit</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" required /></label>}
            {(mode === "login" || mode === "reset") && <label><span>{mode === "reset" ? "Kata sandi baru" : "Kata sandi"}</span><span className="password-field"><input name="password" type={showPassword ? "text" : "password"} minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Min. 10 karakter + angka" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword}><Icon name={showPassword ? "eye-slash" : "eye"} /></button></span></label>}
            {mode === "login" && (emailVerificationEnabled ? <button className="forgot-link" type="button" onClick={() => { setMode("forgot"); setNotice(""); }}>Lupa kata sandi?</button> : <a className="forgot-link" href="mailto:hello@haluandigital.agency?subject=Bantuan akses admin TAP">Lupa kata sandi?</a>)}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "Masuk admin" : mode === "verify" ? "Verifikasi email" : mode === "forgot" ? "Kirim kode reset" : "Simpan kata sandi baru"}<span><Icon name="arrow-up-right" /></span></button>
          </form>

          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {mode !== "login" && <p className="auth-switch"><button type="button" onClick={() => { setMode("login"); setNotice(""); }}>Kembali ke halaman masuk</button></p>}
          <small>Bukan admin? <Link href="/daftar">Daftar sebagai creator</Link> di sini.</small>
        </div>
      </section>
    </main>
  );
}
