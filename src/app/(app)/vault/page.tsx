import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatBytes } from "@/lib/format";
import { QuickVaultUpload } from "./QuickVaultUpload";

// Vault global : tous les fichiers (de tous les projets où l'utilisateur est
// propriétaire ou contributeur), chacun enregistré en base — filename, hash,
// taille, type, qui l'a déposé et quand. Vue transversale, en plus de la vue
// par projet.
export default async function VaultPage() {
  const user = await requireUser();

  const membership = {
    OR: [{ ownerId: user.id }, { contributors: { some: { userId: user.id } } }],
  };

  const [files, projects] = await Promise.all([
    prisma.vaultFile.findMany({
      where: { version: { project: membership } },
      orderBy: { uploadedAt: "desc" },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        version: {
          select: {
            versionNumber: true,
            status: true,
            project: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.project.findMany({
      where: membership,
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vault</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Tous les fichiers protégés, tous projets confondus — chacun enregistré
            en base (hash, taille, type) et ancré sur la blockchain à l&apos;approbation
            de sa version.
          </p>
        </div>

        {files.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            Aucun fichier pour l&apos;instant. Déposez-en un depuis le panneau à droite,
            ou depuis la page d&apos;un projet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="px-3 py-2 font-medium">Fichier</th>
                  <th className="px-3 py-2 font-medium">Projet</th>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Taille</th>
                  <th className="px-3 py-2 font-medium">Utilisateur</th>
                  <th className="px-3 py-2 font-medium">Déposé le</th>
                  <th className="px-3 py-2 font-medium">Preuve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {files.map((f) => (
                  <tr key={f.id}>
                    <td className="max-w-[220px] truncate px-3 py-2" title={f.filename}>
                      {f.filename}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/projects/${f.version.project.id}`}
                        className="underline"
                      >
                        {f.version.project.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {f.version.versionNumber}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium dark:bg-white/10">
                        {f.fileType}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatBytes(f.sizeBytes)}</td>
                    <td className="px-3 py-2">{f.uploadedBy.name ?? f.uploadedBy.email}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {f.uploadedAt.toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-3 py-2">
                      {f.polygonTxHash ? (
                        <span
                          className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-700 dark:text-green-400"
                          title={`SHA-256 ${f.sha256Hash}`}
                        >
                          Ancré
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                          En attente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Déposer un fichier
        </h2>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <QuickVaultUpload projects={projects} />
        </div>
      </aside>
    </div>
  );
}
