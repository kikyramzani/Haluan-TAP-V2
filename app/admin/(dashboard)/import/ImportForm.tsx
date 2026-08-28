"use client";

import { useActionState, useEffect, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { previewImport, confirmImport } from "./actions";

export default function ImportForm() {
  const router = useRouter();
  const [previewState, previewAction, previewPending] = useActionState(previewImport, null);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmImport, null);

  useEffect(() => {
    if (confirmState && "success" in confirmState && confirmState.success) router.refresh();
  }, [confirmState, router]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const textarea = event.currentTarget.form?.elements.namedItem("csv");
    if (!file || !(textarea instanceof HTMLTextAreaElement)) return;
    file.text().then((text) => {
      textarea.value = text;
    });
  }

  const previewOk = previewState && "success" in previewState && previewState.success;
  const confirmOk = confirmState && "success" in confirmState && confirmState.success;

  return (
    <div className="admin-request-form">
      <a className="btn btn-secondary" href="/data/brand-import-template.csv" download="tap-brand-import-template.csv">
        Unduh template CSV
      </a>
      <form action={previewAction}>
        <label>
          <span>Tempel CSV brand (kolom: name, category, logoUrl, hidden, featured)</span>
          <textarea name="csv" rows={8} placeholder={"name,category,logoUrl,hidden,featured\nMS Glow,Beauty & Health,/brand-logos/ms-glow.webp,false,true"} />
        </label>
        <label>
          <span>…atau unggah file CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        </label>
        {previewState && "error" in previewState ? (
          <p className="form-error" role="alert">
            {previewState.error}
          </p>
        ) : null}
        <button className="submit-btn" type="submit" disabled={previewPending}>
          {previewPending ? "Memeriksa…" : "Pratinjau"}
        </button>
      </form>

      {previewOk ? (
        <div className="admin-panel" style={{ marginTop: "var(--space-4)" }}>
          <div className="panel-heading">
            <div>
              <span>PRATINJAU</span>
              <h2>{previewState.rows.length} baris dibaca</h2>
            </div>
          </div>
          <div className="admin-stats">
            <article className="kpi">
              <dt>Baru</dt>
              <dd>{previewState.newCount}</dd>
            </article>
            <article className="kpi">
              <dt>Diperbarui</dt>
              <dd>{previewState.updatedCount}</dd>
            </article>
            <article className="kpi">
              <dt>Tanpa perubahan</dt>
              <dd>{previewState.unchangedCount}</dd>
            </article>
            <article className="kpi">
              <dt>Gagal</dt>
              <dd>{previewState.failedCount}</dd>
            </article>
          </div>

          {previewState.failedRows.length ? (
            <div style={{ marginTop: "var(--space-4)" }}>
              {previewState.failedRows.map((issue) => (
                <div className="issue-row" key={issue.row}>
                  <span className="issue-value">Baris {issue.row}</span>
                  <span className="issue-reason">{issue.reason}</span>
                </div>
              ))}
            </div>
          ) : null}

          {!confirmOk ? (
            <form action={confirmAction} style={{ marginTop: "var(--space-4)" }}>
              <input type="hidden" name="csv" value={previewState.csv} />
              {confirmState && "error" in confirmState ? (
                <p className="form-error" role="alert">
                  {confirmState.error}
                </p>
              ) : null}
              <button className="submit-btn" type="submit" disabled={confirmPending || previewState.newCount + previewState.updatedCount === 0}>
                {confirmPending ? "Mengimpor…" : "Konfirmasi dan impor"}
              </button>
            </form>
          ) : (
            <p className="admin-success" style={{ marginTop: "var(--space-4)" }}>
              Impor selesai: {confirmState.summary.written} brand ditulis ({confirmState.summary.newCount} baru,{" "}
              {confirmState.summary.updatedCount} diperbarui).
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
