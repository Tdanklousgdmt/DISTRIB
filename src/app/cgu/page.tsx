import Link from "next/link";

// Conditions générales d'utilisation — brouillon rédigé à partir du
// fonctionnement réel de l'application. À faire relire par un juriste avant
// mise en production (mention explicite du cahier des charges).

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Objet",
    body: [
      "DISTRIB est un service qui permet à des artistes et à leurs contributeurs de déposer des fichiers de création, d'en conserver une preuve d'antériorité datée, de faire approuver et signer entre eux la répartition des droits, et de préparer leurs déclarations auprès des organismes de gestion collective.",
      "DISTRIB n'est ni un distributeur, ni un éditeur, ni un organisme de gestion collective. Il ne diffuse aucune œuvre, ne perçoit ni ne reverse aucun droit, et ne dépose aucune déclaration à la place de l'utilisateur.",
    ],
  },
  {
    title: "2. Compte et accès",
    body: [
      "L'accès se fait par lien de connexion envoyé à l'adresse e-mail de l'utilisateur, sans mot de passe. L'utilisateur est responsable de la confidentialité de sa boîte e-mail.",
      "Un contributeur invité sur un projet dispose d'un compte créé à partir de l'adresse e-mail saisie par le propriétaire du projet ; il n'accède qu'aux projets sur lesquels il est invité.",
    ],
  },
  {
    title: "3. Dépôts et immuabilité",
    body: [
      "Tout fichier déposé est conservé sans possibilité de suppression ni de modification, y compris par DISTRIB. Cette immuabilité est une caractéristique essentielle du service : elle est ce qui donne sa valeur à la preuve. L'utilisateur reconnaît qu'il ne pourra pas obtenir la suppression d'un fichier déposé, hors obligation légale contraire.",
      "L'utilisateur garantit disposer des droits nécessaires sur tout fichier qu'il dépose et déclare de bonne foi les contributions, y compris la part de contenu généré par intelligence artificielle lorsqu'il en existe une.",
    ],
  },
  {
    title: "4. Preuve d'antériorité",
    body: [
      "Pour chaque fichier déposé, DISTRIB calcule une empreinte numérique et l'inscrit dans un registre public horodaté. Seule cette empreinte est publiée — jamais le fichier lui-même, ni aucune donnée permettant d'identifier l'utilisateur.",
      "Le certificat produit atteste qu'un fichier donné existait à une date donnée et a été approuvé par les contributeurs déclarés. Il ne constitue pas un titre de propriété intellectuelle et ne se substitue pas à un dépôt auprès d'un organisme habilité ou à une décision de justice.",
    ],
  },
  {
    title: "5. Répartition des droits",
    body: [
      "La répartition définie sur une version doit totaliser exactement 100 %. Chaque contributeur signe sa propre part. Toute modification ultérieure de la répartition invalide automatiquement les signatures déjà recueillies, et chaque contributeur concerné en est averti.",
      "DISTRIB fournit l'outil de signature ; la validité juridique de l'accord entre contributeurs relève de leur seule responsabilité.",
    ],
  },
  {
    title: "6. Déclarations aux organismes",
    body: [
      "Les bulletins, attestations et feuilles de présence produits par DISTRIB sont des documents préparatoires. Leur transmission aux organismes concernés (SACEM, ADAMI, SPEDIDAM ou autre) est effectuée par l'utilisateur, qui en assume la responsabilité et l'exactitude.",
    ],
  },
  {
    title: "7. Détection de similarité",
    body: [
      "DISTRIB compare les empreintes acoustiques des fichiers déposés, entre eux et avec des plateformes externes. Une correspondance détectée est signalée aux parties concernées ; elle ne préjuge d'aucune contrefaçon et ne bloque la publication que tant que le propriétaire de l'œuvre antérieure n'a pas tranché.",
    ],
  },
  {
    title: "8. Responsabilité",
    body: [
      "DISTRIB met en œuvre les moyens raisonnables pour assurer la disponibilité du service et l'intégrité des preuves, sans garantie de résultat quant à l'issue d'un litige ou d'une démarche auprès d'un organisme.",
    ],
  },
  {
    title: "9. Modification et droit applicable",
    body: [
      "Les présentes conditions peuvent être modifiées ; l'utilisateur en est informé et la version en vigueur est celle publiée sur cette page. Elles sont soumises au droit français.",
    ],
  },
];

export default function CguPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link href="/faq" className="text-xs text-black/50 hover:underline dark:text-white/50">
        ← Aide
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Conditions générales d&apos;utilisation</h1>
      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        Brouillon rédigé à partir du fonctionnement réel du service — à faire relire par un
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
