"use client";

import { useRef, useState, useTransition } from "react";
import { uploadBrandLogo } from "./actions";

/**
 * The logoUrl text input stays the source of truth BrandForm submits (name="logoUrl"),
 * this just offers a second way to fill it. Typing a path/URL directly still works exactly
 * as before, for existing migrated logos.
 */
export default function LogoUploadField({ defaultValue }: { defaultValue?: string | null }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadBrandLogo(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        setUrl(result.url);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <label>
      <span>Logo (path/URL, atau unggah file)</span>
      <input name="logoUrl" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="/brand-logos/nama-brand.webp" />
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={pending} style={{ marginTop: "var(--space-2)" }} />
      {pending ? <small>Mengunggah…</small> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}
