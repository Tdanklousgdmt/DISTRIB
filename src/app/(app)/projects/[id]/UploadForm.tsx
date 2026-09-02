"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { aiDisclosureCategories, aiDisclosureLabels } from "@/lib/validators";

// Upload d'un fichier vers une version. POST multipart → /api/upload.
// (fetch côté client : permet la barre de progression / le statut, et garde
// les fichiers volumineux hors du flux Server Action.)
//
// Inclut la déclaration des catégories DDEX de part IA générative (art. 50
// AI Act) — facultative, cochée au moment du dépôt, jamais après coup.
export function UploadForm({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [aiSelected, setAiSelected] = useState<string[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("error");
      setMessage("Sélectionnez un fichier.");
      return;
    }
    data.set("versionId", versionId);
    data.delete("aiCategories");
    aiSelected.forEach((c) => data.append("aiCategories", c));

    setStatus("uploading");
    setMessage(null);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Échec de l'upload.");
        return;
      }
      setStatus("idle");
      setMessage(json.deduplicated ? "Fichier déjà protégé (identique)." : "Fichier protégé.");
      formEl.reset();
      setAiSelected([]);
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Erreur réseau pendant l'upload.");
    }
  }

  function toggleAi(category: string) {
    setAiSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          required
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-background"
        />
        <button
          type="submit"
          disabled={status === "uploading"}
          className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {status === "uploading" ? "Ajout…" : "Ajouter un fichier à ce dépôt"}
        </button>
        {message && (
          <span className={"text-xs " + (status === "error" ? "text-red-600" : "text-green-600")}>
            {message}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowAi((v) => !v)}
        className="w-fit text-[11.5px] font-mono hover:underline"
        style={{ color: "var(--faint)" }}
      >
        {showAi ? "▾" : "▸"} Part d&apos;intelligence artificielle
        {aiSelected.length > 0 ? ` (${aiSelected.length})` : ""}
      </button>

      {showAi && (
        <div
          className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-xs"
          style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        >
          {aiDisclosureCategories.map((cat) => (
            <label key={cat} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={aiSelected.includes(cat)}
                onChange={() => toggleAi(cat)}
              />
              {aiDisclosureLabels[cat]}
            </label>
          ))}
        </div>
      )}
    </form>
  );
}
