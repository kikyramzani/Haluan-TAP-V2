"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { track } from "@vercel/analytics";
import Icon from "../components/Icon";
import Illustration from "../components/Illustration";

type AuthMode = "register" | "login" | "verify" | "forgot" | "reset";

export default function AuthClient({ googleEnabled, emailVerificationEnabled, initialDealCount, initialMode }: { googleEnabled: boolean; emailVerificationEnabled: boolean; initialDealCount: number | null; initialMode: "register" | "login" }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [dealCount] = useState<number | null>(initialDealCount);
  const [challengeId, setChallengeId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const requestedReturn = params.get("returnTo");
    const error = params.get("error");
    const timer = window.setTimeout(() => {
      if (requestedMode === "login" || requestedMode === "activate") setMode("login");
      if (requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//")) setReturnTo(requestedReturn);
      if (error === "google_unavailable") setNotice("Login Google belum tersedia. Silakan gunakan email.");
      if (error === "google_failed") setNotice("Login Google gagal. Silakan coba kembali atau gunakan email.");
      if (error === "system_unavailable") setNotice("Sistem akun sedang tidak tersedia. Silakan coba kembali beberapa saat lagi.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice("");
    const params = new URLSearchParams();
    if (nextMode === "login") params.set("mode", "login");
    if (returnTo !== "/dashboard") params.set("returnTo", returnTo);
    window.history.replaceState({}, "", `/daftar${params.size ? `?${params}` : ""}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : mode === "login" ? "/api/auth/login" : mode === "verify" ? "/api/auth/verify/confirm" : mode === "forgot" ? "/api/auth/verify/request" : "/api/auth/password/reset";
      const body = mode === "forgot" ? { ...values, purpose: "reset" } : mode === "verify" || mode === "reset" ? { ...values, challengeId, code, returnTo } : { ...values, consent: values.consent === "on", returnTo };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok && mode === "login" && payload.verificationRequired) {
        const email = String(values.email || "");
        // The password check just proved which account this is, and the login
        // response carries that proof; the reissue is bound to it rather than to
        // the address typed into the form.
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
      if (mode === "register") track("signup_submit");
      if (mode === "register" && payload.verificationRequired) {
        setAuthEmail(String(values.email || ""));
        setChallengeId(payload.challengeId);
        setCode(payload.debugCode || "");
        setMode("verify");
        setNotice("Kode verifikasi sudah dikirim ke email kamu.");
        setBusy(false);
        return;
      }
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
      // The change landed, but this request is not the one that was signed in -
      // a retry of a code that had already been spent. Sending it to the
      // dashboard would only bounce back here, so it lands on the login form with
      // the email it already knows.
      if (payload.signedIn === false) {
        setCode("");
        setMode("login");
        setNotice(payload.notice || "Perubahan kamu sudah tersimpan. Masuk untuk melanjutkan.");
        setBusy(false);
        return;
      }
      window.location.assign(payload.returnTo || returnTo);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Autentikasi gagal."); setBusy(false); }
  }

  return (
    <main className="auth-main">
      <nav className="nav shell auth-nav">
        <Link className="brand" href="/" aria-label="TAP by Haluan home"><Image src="/haluan-logo.png" alt="Haluan Digital Network" width={107} height={35}/><span className="brand-divider" /><strong>TAP</strong></Link>
        <Link className="back-link" href="/"><Icon name="arrow-left" /> Kembali ke home</Link>
      </nav>

      <section className="auth-page shell">
        <div className="auth-context">
          <span className="eyebrow"><span className="live-dot" /> Creator access</span>
          <h1>Satu akun.<br /><em>Semua deal.</em></h1>
          <p>{mode === "register" ? "Daftar untuk request sample, melengkapi profil, dan memantau aktivitas campaign kamu." : mode === "login" ? "Masuk untuk melanjutkan request sample dan mengelola profil creator." : "Amankan akses akunmu lewat kode sekali pakai yang dikirim ke email."}</p>
          <div className="auth-points"><span><i className="auth-point-mark"><Icon name="check" /></i>{dealCount === null ? "Deal terkurasi" : `${dealCount} deal terkurasi`}</span><span><i className="auth-point-mark"><Icon name="check" /></i>Extra rate khusus member</span><span><i className="auth-point-mark"><Icon name="check" /></i>Gratis untuk creator Haluan</span></div>
          {/* Kartu creator + rantai link + grafik naik: tiga hal yang persis
              dijanjikan checklist di atasnya. Mengisi ruang kosong kolom kiri
              yang muncul karena kolom kanan jauh lebih tinggi. */}
          <Illustration scene="signup" className="auth-art" />
        </div>

        <div className="auth-card">
          {/* Bukan role="tablist": tidak ada tabpanel, tidak ada aria-controls, dan
              tidak ada navigasi panah. Mengumumkannya sebagai "tab 1 dari 2"
              menjanjikan perilaku yang tidak ada. Ini toggle dua pilihan biasa. */}
          {(mode === "register" || mode === "login") && <div className="auth-tabs" role="group" aria-label="Pilih akses creator">
            <button type="button" aria-pressed={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Daftar</button>
            <button type="button" aria-pressed={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Masuk</button>
          </div>}

          <div className="auth-heading">
            <span>{mode === "register" ? "BUAT AKUN CREATOR" : mode === "login" ? "SELAMAT DATANG KEMBALI" : mode === "verify" ? "VERIFIKASI EMAIL" : "PULIHKAN AKUN"}</span>
            <h2>{mode === "register" ? "Mulai dalam satu menit." : mode === "login" ? "Masuk ke akunmu." : mode === "verify" ? "Cek email kamu." : mode === "forgot" ? "Atur ulang kata sandi." : "Buat kata sandi baru."}</h2>
            <p>{mode === "register" ? "Profil creator yang lebih lengkap dapat kamu isi setelah masuk." : mode === "login" ? "Akses deal dan sample yang tersimpan di akunmu." : mode === "verify" ? `Masukkan kode enam digit yang dikirim ke ${authEmail}.` : mode === "forgot" ? "Kami akan mengirim kode reset jika email terdaftar." : `Masukkan kode yang dikirim ke ${authEmail}.`}</p>
          </div>

          {googleEnabled && (mode === "register" || mode === "login") && <>
            <a className="google-button" href={`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}><b>G</b><span>{mode === "register" ? "Daftar dengan Google" : "Masuk dengan Google"}</span></a>
            <div className="auth-divider"><span>atau lanjut dengan email</span></div>
          </>}

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && <>
              <label><span>Nama lengkap</span><input name="name" autoComplete="name" placeholder="Nama lengkap kamu" required /></label>
              <label><span>Nomor WhatsApp</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" required /></label>
            </>}
            {(mode === "register" || mode === "login" || mode === "forgot") && <label><span>Email</span><input key={`email-${mode}`} name="email" type="email" autoComplete="email" defaultValue={mode === "login" ? authEmail : ""} placeholder="nama@email.com" required /></label>}
            {(mode === "verify" || mode === "reset") && <label><span>Kode enam digit</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" required /></label>}
            {(mode === "register" || mode === "login" || mode === "reset") && <label><span>{mode === "reset" ? "Kata sandi baru" : "Kata sandi"}</span><span className="password-field"><input name="password" type={showPassword ? "text" : "password"} minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Min. 10 karakter + angka" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword}><Icon name={showPassword ? "eye-slash" : "eye"} /></button></span></label>}
            {mode === "register" && <label className="auth-consent"><input name="consent" type="checkbox" required /><span>Saya menyetujui <a href="/terms" target="_blank">Ketentuan</a> dan <a href="/privacy" target="_blank">Kebijakan Privasi</a> TAP.</span></label>}
            {mode === "login" && (emailVerificationEnabled ? <button className="forgot-link" type="button" onClick={() => { setMode("forgot"); setNotice(""); }}>Lupa kata sandi?</button> : <a className="forgot-link" href="mailto:hello@haluandigital.agency?subject=Bantuan akses TAP">Lupa kata sandi?</a>)}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Memproses…" : mode === "register" ? "Buat akun" : mode === "login" ? "Masuk creator" : mode === "verify" ? "Verifikasi email" : mode === "forgot" ? "Kirim kode reset" : "Simpan kata sandi baru"}<Icon name="arrow-up-right" /></button>
          </form>

          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {(mode === "register" || mode === "login") ? <p className="auth-switch">{mode === "register" ? "Sudah punya akun?" : "Belum punya akun?"} <button type="button" onClick={() => changeMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Masuk" : "Daftar"}</button></p> : <p className="auth-switch"><button type="button" onClick={() => changeMode("login")}>Kembali ke halaman masuk</button></p>}
          <small>Link etalase tersedia untuk publik. Akun diperlukan untuk request sample dan fitur creator.</small>
        </div>
      </section>
    </main>
  );
}
