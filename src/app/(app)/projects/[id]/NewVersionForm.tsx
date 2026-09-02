"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { aiDisclosureCategories, aiDisclosureLabels } from "@/lib/validators";
import { createVersionAction } from "../../actions";

// Nouveau dépôt en UN geste : commentaire (l'attestation de contribution,
// horodatée — preuve de paternité) + fichier(s) + part IA. Crée la version
// via createVersionAction puis uploade chaque fichier dedans — même flux que
// le dépôt rapide du Vault, aucune règle dupliquée. Chaque dépôt ouvre son
// propre tour d'approbation (créateur auto-approuvé, les autres attendus).
export function NewVersionForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [aiSelected, setAiSelected] = useState<string[]>([]);

  function toggleAi(category: string) {
    setAiSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    const files = data.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      setStatus("error");
      setMessage("Sélectionnez au moins un fichier.");
      return;
    }

    setStatus("working");
    setMessage(null);

    // 1. La version = le dépôt : commentaire horodaté + tour d'approbation ouvert.
    const versionData = new FormData();
    versionData.set("projectId", projectId);
    versionData.set("description", String(data.get("description") ?? ""));
    versionData.set("duration", String(data.get("duration") ?? ""));
    const versionResult = await createVersionAction(undefined, versionData);
    if (versionResult?.error || !versionResult?.versionId) {
      setStatus("error");
      setMessage(versionResult?.error ?? "Échec de la création du dépôt.");
      return;
    }

    // 2. Chaque fichier va dans ce dépôt — même route que partout ailleurs.
    let uploaded = 0;
    for (const file of files) {
      const uploadData = new FormData();
      uploadData.set("file", file);
      uploadData.set("versionId", versionResult.versionId);
      aiSelected.forEach((c) => uploadData.append("aiCategories", c));
      try {
        const res = await fetch("/api/upload", { method: "POST", body: uploadData });
        const json = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(
            `${json.error ?? "Échec de l'upload."} (${uploaded}/${files.length} fichier${files.length > 1 ? "s" : ""} déposé${uploaded > 1 ? "s" : ""})`,
          );
          router.refresh();
          return;
        }
        uploaded++;
      } catch {
        setStatus("error");
        setMessage("Erreur réseau pendant l'upload.");
        router.refresh();
        return;
      }
    }

    setStatus("idle");
    setMessage(
      uploaded > 1
        ? `${uploaded} fichiers protégés — en attente d'approbation.`
        : "Fichier protégé — en attente d'approbation.",
    );
    formEl.reset();
    setAiSelected([]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Votre commentaire
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          maxLength={5000}
          placeholder="Ex : Topline + mélodie du refrain, prod par X…"
          className="mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Horodaté avec le dépôt — c&apos;est votre preuve de paternité. Chaque dépôt attend
          ensuite l&apos;approbation des autres contributeurs.
        </p>
      </div>

      <div>
        <label htmlFor="files" className="block text-sm font-medium">
          Fichier(s)
        </label>
        <input
          id="files"
          type="file"
          name="files"
          multiple
          required
          className="mt-1 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-background"
        />
      </div>

      <div>
        <label htmlFor="duration" className="block text-sm font-medium">
          Durée <span className="font-normal text-black/40 dark:text-white/40">(facultatif)</span>
        </label>
        <input
          id="duration"
          name="duration"
          type="text"
          placeholder="mm:ss"
          pattern="^(\d+:)?\d{1,2}:\d{2}$"
          className="mt-1 w-28 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAi((v) => !v)}
        className="w-fit font-mono text-[11.5px] hover:underline"
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

      {message && (
        <p className={"text-xs " + (status === "error" ? "text-red-600" : "text-green-600")}>
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "working"}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {status === "working" ? "Protection…" : "Déposer & protéger"}
      </button>
    </form>
  );
}
