import Link from "next/link";

// Politique de traitement des données personnelles (DPA / RGPD) — brouillon
// rédigé à partir des traitements réellement effectués par l'application.
// À faire relire par un juriste avant mise en production.

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "Ce que nous collectons",
    body: [
      "Votre adresse e-mail (identifiant de compte), votre nom si vous le renseignez, votre code IPI si vous le saisissez pour vos déclarations, et les fichiers de création que vous déposez avec leurs métadonnées (nom, taille, type, date, empreinte numérique, part déclarée de contenu généré par IA).",
      "Les informations liées à vos projets : contributeurs invités et leurs rôles, descriptions de contribution, approbations et commentaires, répartitions et signatures, concerts et déclarations.",
    ],
  },
  {
    title: "Pourquoi",
    body: [
      "Pour fournir le service : conserver vos preuves, organiser les approbations entre contributeurs, préparer vos déclarations et vous alerter des actions en attente. Base légale : l'exécution du contrat qui nous lie.",
      "Pour détecter des correspondances entre œuvres : une empreinte acoustique est calculée à partir de chaque fichier audio déposé. Cette empreinte n'est pas une donnée biométrique — elle décrit le signal sonore, pas une personne — et n'est jamais utilisée pour entraîner un modèle d'intelligence artificielle.",
    ],
  },
  {
    title: "Ce qui devient public",
    body: [
      "Uniquement l'empreinte numérique (hash) de chaque fichier, inscrite dans un registre public horodaté. Ni le fichier, ni votre nom, ni votre e-mail ne sont publiés. Une empreinte ne permet pas de reconstituer le fichier ni d'identifier une personne.",
    ],
  },
  {
    title: "Conservation",
    body: [
      "Les fichiers déposés et leurs preuves sont conservés sans limitation de durée et ne peuvent pas être supprimés — c'est la condition de leur valeur probante. Les données de compte sont conservées tant que le compte existe.",
    ],
  },
  {
    title: "Sous-traitants",
    body: [
      "Hébergement de l'application et stockage des fichiers chez un prestataire de droit européen. Envoi des e-mails de connexion et de rappel (Resend). Signature électronique des documents lorsque vous la demandez (Yousign, prestataire européen). Comparaison des empreintes avec les plateformes externes (AudD). Chaque sous-traitant ne reçoit que ce qui est strictement nécessaire à sa tâche.",
    ],
  },
  {
    title: "Vos droits",
    body: [
      "Vous pouvez accéder à vos données, les rectifier, en demander une copie ou vous opposer à certains traitements en nous écrivant. Le droit à l'effacement ne s'applique pas aux fichiers déposés ni à leurs preuves, conservés au titre de l'exécution du service et de l'intérêt légitime à préserver la valeur des preuves de tous les contributeurs. Vous pouvez saisir la CNIL en cas de désaccord.",
    ],
  },
];

export default function ConfidentialitePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link href="/faq" className="text-xs text-black/50 hover:underline dark:text-white/50">
        ← Aide
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Données personnelles</h1>
      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Brouillon rédigé à partir des traitements réellement effectués — à faire relire par un
        juriste avant mise en production.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-medium">{s.title}</h2>
            <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-black/70 dark:text-white/70">
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
