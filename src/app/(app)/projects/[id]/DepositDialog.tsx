"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  aiDisclosureCategories,
  aiDisclosureLabels,
  contributorRoleLabels,
  contributorRoles,
} from "@/lib/validators";
import { createVersionAction } from "../../actions";

// « Déposer un fichier » — écran p.65 du prototype : fichiers, « votre rôle sur
// ce dépôt », votre attestation dans vos propres mots, puis « Déposer et
// notifier ». Un dépôt = une version : attestation horodatée + tour
// d'approbation ouvert (créateur auto-approuvé, les autres notifiés).
export function DepositDialog({
  projectId,
  defaultRole,
}: {
  projectId: string;
  defaultRole: (typeof contributorRoles)[number];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [aiSelected, setAiSelected] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);

  function open() {
    setStatus("idle");
    setMessage(null);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

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
      setMessage("Déposez au moins un fichier.");
      return;
    }

    setStatus("working");
    setMessage(null);

    const versionData = new FormData();
    versionData.set("projectId", projectId);
    versionData.set("description", String(data.get("description") ?? ""));
    versionData.set("duration", String(data.get("duration") ?? ""));
    versionData.set("depositRole", String(data.get("depositRole") ?? defaultRole));
    versionData.set("depositRoleDetail", String(data.get("depositRoleDetail") ?? ""));
    const created = await createVersionAction(undefined, versionData);
    if (created?.error || !created?.versionId) {
      setStatus("error");
      setMessage(created?.error ?? "Échec du dépôt.");
      return;
    }

    let uploaded = 0;
    for (const file of files) {
      const uploadData = new FormData();
      uploadData.set("file", file);
      uploadData.set("versionId", created.versionId);
      aiSelected.forEach((c) => uploadData.append("aiCategories", c));
      try {
        const res = await fetch("/api/upload", { method: "POST", body: uploadData });
        const json = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(`${json.error ?? "Échec de l'upload."} (${uploaded}/${files.length})`);
          router.refresh();
          return;
        }
        uploaded++;
      } catch {
        setStatus("error");
        setMessage("Erreur réseau pendant le dépôt.");
        router.refresh();
        return;
      }
    }

    setStatus("idle");
    formEl.reset();
    setAiSelected([]);
    setFileNames([]);
    close();
    router.refresh();
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
        </svg>
        Déposer un fichier
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl border border-black/10 bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40 dark:border-white/10"
        onClose={() => setStatus("idle")}
      >
        <form onSubmit={onSubmit} method="dialog" className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Déposer un fichier</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="rounded-full px-2 py-1 text-sm text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
            >
              ×
            </button>
          </div>

          <label className="block cursor-pointer rounded-xl border border-dashed border-black/20 bg-black/[.02] px-4 py-6 text-center text-sm hover:border-black/40 dark:border-white/20 dark:bg-white/[.03] dark:hover:border-white/40">
            <input
              type="file"
              name="files"
              multiple
              required
              className="sr-only"
              onChange={(e) => setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))}
            />
            <span className="block font-medium">Déposez vos fichiers</span>
            <span className="mt-1 block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/40 dark:text-white/40">
              WAV · FLP · ALS · PTX · stems · paroles · vidéo
            </span>
            {fileNames.length > 0 && (
              <span className="mt-2 block text-xs text-black/60 dark:text-white/60">
                {fileNames.join(" · ")}
              </span>
            )}
          </label>

          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div>
              <label htmlFor="depositRole" className="block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/50 dark:text-white/50">
                Votre rôle sur ce dépôt
              </label>
              <select id="depositRole" name="depositRole" defaultValue={defaultRole} className={inputCls + " dark:bg-black"}>
                {contributorRoles.map((r) => (
                  <option key={r} value={r}>
                    {contributorRoleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="depositRoleDetail" className="block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/50 dark:text-white/50">
                Précision <span className="normal-case tracking-normal">(voix, mix…)</span>
              </label>
              <input id="depositRoleDetail" name="depositRoleDetail" maxLength={60} placeholder="voix" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/50 dark:text-white/50">
              Votre attestation, dans vos propres mots
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={3}
              maxLength={5000}
              placeholder="J'atteste que moi, …, ai écrit et interprété les voix de ce titre."
              className={inputCls}
            />
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Ce texte constitue votre preuve de paternité, daté et signé. Décrivez simplement votre
              contribution.
            </p>
          </div>

          <div className="flex items-end gap-4">
            <div>
              <label htmlFor="duration" className="block font-mono text-[10.5px] uppercase tracking-[.08em] text-black/50 dark:text-white/50">
                Durée <span className="normal-case tracking-normal">(facultatif)</span>
              </label>
              <input id="duration" name="duration" type="text" placeholder="mm:ss" pattern="^(\d+:)?\d{1,2}:\d{2}$" className={inputCls + " w-28"} />
            </div>
            <button
              type="button"
              onClick={() => setShowAi((v) => !v)}
              className="pb-2 font-mono text-[11.5px] hover:underline"
              style={{ color: "var(--faint)" }}
            >
              {showAi ? "▾" : "▸"} Part d&apos;intelligence artificielle
              {aiSelected.length > 0 ? ` (${aiSelected.length})` : ""}
            </button>
          </div>
          {showAi && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
              {aiDisclosureCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={aiSelected.includes(cat)} onChange={() => toggleAi(cat)} />
                  {aiDisclosureLabels[cat]}
                </label>
              ))}
            </div>
          )}

          <div className="rounded-lg border-l-2 border-black/60 bg-black/[.03] px-4 py-3 text-xs dark:border-white/60 dark:bg-white/[.04]">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">
              Déroulement
            </div>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-black/70 dark:text-white/70">
              <li>
                Votre fichier est <strong>daté et protégé</strong> dès sa réception.
              </li>
              <li>L&apos;ensemble des contributeurs est notifié pour approbation.</li>
              <li>
                Une fois approuvé par tous, il est <strong>scellé par consentement collectif</strong> — de
                façon définitive.
              </li>
            </ol>
          </div>

          {message && (
            <p className={"text-xs " + (status === "error" ? "text-red-600" : "text-green-600")}>{message}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={status === "working"}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {status === "working" ? "Dépôt en cours…" : "Déposer et notifier"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
