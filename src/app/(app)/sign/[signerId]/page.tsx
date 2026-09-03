import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { signatureConsentText } from "@/lib/esign/service";
import { avatarColor, displayName, initials } from "@/lib/avatar";
import { SignatureCeremony } from "./SignatureCeremony";

const levelLabels: Record<string, string> = {
  SIMPLE: "électronique simple",
  ADVANCED: "électronique avancée",
  QUALIFIED: "électronique qualifiée",
};

// Page de cérémonie : ce que le signataire lit, puis signe.
export default async function SignPage({ params }: { params: Promise<{ signerId: string }> }) {
  const { signerId } = await params;
  const user = await requireUser();

  const signer = await prisma.signatureSigner.findUnique({
    where: { id: signerId },
    include: {
      request: {
        include: {
          signers: { orderBy: { email: "asc" } },
          version: {
            include: {
              project: { select: { id: true, title: true } },
              splits: { include: { contributor: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!signer || signer.userId !== user.id) notFound();
  const req = signer.request;
  const mySplit = req.version?.splits.find((s) => s.contributor.userId === user.id) ?? null;
  const backHref = req.version ? `/projects/${req.version.project.id}/fiche-sacem` : "/dashboard";
  const docUrl = `/api/signature-requests/${req.id}/document`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-black/50 hover:underline dark:text-white/50">
          ← {req.version ? req.version.project.title : "Retour"}
        </Link>
        <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[.14em]" style={{ color: "var(--accent)" }}>
          — Signature {levelLabels[req.level] ?? req.level.toLowerCase()}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{req.title}</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Lisez le document, puis signez. Votre signature sera horodatée et consignée sur la page de
          signatures du PDF final, avec l&apos;empreinte du document.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <iframe src={docUrl} title="Document à signer" className="h-[520px] w-full bg-white" />
        <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 text-xs dark:border-white/10">
          <span className="font-mono text-black/50 dark:text-white/50">
            SHA-256 {req.documentSha256.slice(0, 16)}…
          </span>
          <a href={docUrl} target="_blank" rel="noreferrer" className="underline">
            Ouvrir le PDF
          </a>
        </div>
      </div>

      <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-black/50 dark:text-white/50">
          Parties
        </div>
        <ul className="mt-3 space-y-2">
          {req.signers.map((s) => (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] font-mono text-[10px] font-semibold text-white"
                style={{ background: avatarColor(s.userId) }}
              >
                {initials(displayName({ name: s.name, email: s.email }))}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {displayName({ name: s.name, email: s.email })}
                {s.userId === user.id && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(vous)</span>}
              </span>
              {s.status === "SIGNED" ? (
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 font-mono text-[10.5px] text-green-700 dark:text-green-400">
                  Signée{s.signedAt ? ` · ${s.signedAt.toLocaleDateString("fr-FR")}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] text-amber-700 dark:text-amber-400">
                  En attente
                </span>
              )}
            </li>
          ))}
        </ul>
        {mySplit && (
          <p className="mt-4 border-t border-black/10 pt-3 text-sm dark:border-white/10">
            Votre part : <span className="font-mono font-semibold">{Number(mySplit.percentage).toFixed(2)} %</span>
            {mySplit.roleLabel ? <span className="text-black/50 dark:text-white/50"> · {mySplit.roleLabel}</span> : null}
          </p>
        )}
      </section>

      {signer.status === "SIGNED" ? (
        <section className="rounded-xl border border-green-500/30 bg-green-500/5 p-5">
          <h2 className="font-semibold">Vous avez signé</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Le {signer.signedAt?.toLocaleString("fr-FR")} en tant que « {signer.signedName} ».
          </p>
          {req.status === "COMPLETED" ? (
            <a
              href={`${docUrl}?signed=1`}
              className="mt-3 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Télécharger le document signé par tous — PDF
            </a>
          ) : (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">
              Le PDF final sera scellé dès que toutes les parties auront signé.
            </p>
          )}
        </section>
      ) : req.status !== "PENDING" ? (
        <p className="rounded-xl border border-dashed border-black/15 p-5 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Cette demande n&apos;est plus ouverte (une nouvelle répartition a été adressée).
        </p>
      ) : req.provider === "LOCAL" ? (
        <section className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="font-semibold">Signer</h2>
          <div className="mt-4">
            <SignatureCeremony
              signerId={signer.id}
              defaultName={signer.name ?? ""}
              consentText={signatureConsentText()}
            />
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-black/15 p-5 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          Cette demande est traitée par {req.provider === "YOUSIGN" ? "Yousign" : "un prestataire"} :
          vous avez reçu un e-mail avec votre lien de signature.
        </p>
      )}
    </div>
  );
}
