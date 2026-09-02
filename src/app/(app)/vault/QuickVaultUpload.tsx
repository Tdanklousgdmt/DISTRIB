"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { contributorRoleLabels, contributorRoles } from "@/lib/validators";
import { createVersionAction } from "../actions";

// Dépôt rapide depuis le Vault global : crée un dépôt (attestation + rôle sur
// ce dépôt — la preuve de paternité) PUIS uploade le fichier dedans, en un
// seul geste. Réutilise exactement le même flux que la page projet (Server
// Action createVersionAction + route /api/upload) — aucune règle dupliquée.
export function QuickVaultUpload({
  projects,
}: {
  projects: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    const projectId = String(data.get("projectId") ?? "");
    const file = data.get("file");

    if (!projectId) {
      setStatus("error");
      setMessage("Choisissez un projet.");
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      setStatus("error");
      setMessage("Sélectionnez un fichier.");
      return;
    }

    setStatus("working");
    setMessage(null);

    // 1. Le dépôt (attestation horodatée, tour d'approbation ouvert).
    const versionData = new FormData();
    versionData.set("projectId", projectId);
    versionData.set("description", String(data.get("description") ?? ""));
    versionData.set("depositRole", String(data.get("depositRole") ?? "ARTIST"));
    versionData.set("depositRoleDetail", String(data.get("depositRoleDetail") ?? ""));
    const versionResult = await createVersionAction(undefined, versionData);
    if (versionResult?.error || !versionResult?.versionId) {
      setStatus("error");
      setMessage(versionResult?.error ?? "Échec de la création du dépôt.");
      return;
    }

    // 2. Le fichier dans ce dépôt — même route que la page projet.
    const uploadData = new FormData();
    uploadData.set("file", file);
    uploadData.set("versionId", versionResult.versionId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: uploadData });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Échec de l'upload.");
        return;
      }
      setStatus("idle");
      setMessage("Fichier daté et protégé — en attente d'approbation.");
      formEl.reset();
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Erreur réseau pendant l'upload.");
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Créez d&apos;abord un projet pour pouvoir y déposer un fichier.
      </p>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="qv-project" className="block text-sm font-medium">
          Projet
        </label>
        <select id="qv-project" name="projectId" required className={inputCls + " dark:bg-black"}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="qv-role" className="block text-sm font-medium">
            Votre rôle sur ce dépôt
          </label>
          <select id="qv-role" name="depositRole" defaultValue="ARTIST" className={inputCls + " dark:bg-black"}>
            {contributorRoles.map((r) => (
              <option key={r} value={r}>
                {contributorRoleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="qv-role-detail" className="block text-sm font-medium">
            Précision <span className="text-black/40 dark:text-white/40">(voix, mix…)</span>
          </label>
          <input id="qv-role-detail" name="depositRoleDetail" maxLength={60} placeholder="voix" className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="qv-description" className="block text-sm font-medium">
          Votre attestation, dans vos propres mots
        </label>
        <textarea
          id="qv-description"
          name="description"
          required
          rows={2}
          maxLength={5000}
          placeholder="Ex : J'atteste avoir composé et mixé ce stem batterie, session du 14 août…"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Datée avec le dépôt — c&apos;est votre preuve de paternité, comme sur la page projet.
        </p>
      </div>
      <div>
        <label htmlFor="qv-file" className="block text-sm font-medium">
          Fichier
        </label>
        <input
          id="qv-file"
          type="file"
          name="file"
          required
          className="mt-1 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-background"
        />
      </div>
      {message && (
        <p className={"text-xs " + (status === "error" ? "text-red-600" : "text-green-600")}>{message}</p>
      )}
      <button
        type="submit"
        disabled={status === "working"}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {status === "working" ? "Dépôt en cours…" : "Déposer et notifier"}
      </button>
    </form>
  );
}
