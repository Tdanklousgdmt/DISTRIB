"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { attachOwnFicheAction } from "../../../actions";

// « Déposer ma propre fiche » (p.66) : l'artiste a déjà sa déclaration — le PDF
// est versé au vault (immuable, daté) puis rattaché comme bulletin. DISTRIB
// se charge uniquement de la faire signer et de l'archiver.
export function OwnFicheUpload({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("fiche");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("error");
      setMessage("Sélectionnez votre fiche (PDF).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus("error");
      setMessage("PDF trop lourd (10 Mo maximum).");
      return;
    }

    setStatus("working");
    setMessage(null);
    try {
      const uploadData = new FormData();
      uploadData.set("file", file);
      uploadData.set("versionId", versionId);
      uploadData.set("fileType", "OTHER");
      const res = await fetch("/api/upload", { method: "POST", body: uploadData });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Échec du dépôt.");
        return;
      }
      const attach = new FormData();
      attach.set("versionId", versionId);
      attach.set("vaultFileId", json.file.id);
      const result = await attachOwnFicheAction(undefined, attach);
      if (result?.error) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setStatus("idle");
      setMessage("Fiche archivée et datée — prête à être signée.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Erreur réseau pendant le dépôt.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block cursor-pointer rounded-xl border border-dashed border-black/20 bg-black/[.02] px-4 py-10 text-center text-sm hover:border-black/40 dark:border-white/20 dark:bg-white/[.03] dark:hover:border-white/40">
        <input
          type="file"
          name="fiche"
          accept="application/pdf"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <span className="block font-medium">Déposez votre fiche</span>
        <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/40 dark:text-white/40">
          PDF · jusqu&apos;à 10 Mo
        </span>
        {fileName && <span className="mt-2 block text-xs text-black/60 dark:text-white/60">{fileName}</span>}
      </label>
      {message && (
        <p className={"text-xs " + (status === "error" ? "text-red-600" : "text-green-600")}>{message}</p>
      )}
      <button
        type="submit"
        disabled={status === "working"}
        className="w-full rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {status === "working" ? "Archivage…" : "Parcourir et adresser en signature"}
      </button>
    </form>
  );
}
