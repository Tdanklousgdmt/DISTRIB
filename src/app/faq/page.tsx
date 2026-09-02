import Link from "next/link";

import { auth } from "@/lib/auth";

// Page d'aide publique — corrige le malentendu de positionnement identifié
// dans le cahier des charges (le nom « DISTRIB » laisse penser à un service
// de distribution). Le nom est conservé, la baseline fait le travail.
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "DISTRIB distribue-t-il ma musique sur Spotify, Deezer ou Apple Music ?",
    a: "Non. DISTRIB ne distribue rien et ne remplace pas votre distributeur. DISTRIB sert à prouver qui a créé quoi, quand, et à préparer vos déclarations de droits — la diffusion sur les plateformes reste entre vos mains et celles de votre distributeur habituel.",
  },
  {
    q: "Alors à quoi sert DISTRIB ?",
    a: "À trois choses : garder une preuve datée et infalsifiable de chaque fichier que vous déposez ; faire approuver et signer la répartition des droits entre tous les contributeurs ; et préparer vos déclarations (SACEM, ADAMI, SPEDIDAM) à partir de ces preuves plutôt que de tout ressaisir.",
  },
  {
    q: "Est-ce que DISTRIB déclare mes œuvres à la SACEM à ma place ?",
    a: "Non. Aucun organisme n'ouvre d'API de dépôt automatique. DISTRIB produit un dossier « déclaration-ready » — bulletin PDF, répartition signée, preuves jointes — que vous transmettez vous-même. « Déclarable » ne veut jamais dire « déclaré ».",
  },
  {
    q: "Que prouve exactement un certificat DISTRIB ?",
    a: "Qu'un fichier précis existait à une date précise, déposé par un compte précis, et que les contributeurs déclarés l'ont approuvé. Il ne prouve pas que vous êtes l'auteur au sens juridique — c'est une preuve d'antériorité, à faire valoir devant un juge ou un organisme, pas un titre de propriété.",
  },
  {
    q: "Puis-je supprimer un fichier déposé ?",
    a: "Non, jamais — c'est volontaire. Une preuve qui peut disparaître ne vaut rien. Vous pouvez déposer une nouvelle version, mais l'ancienne reste conservée et horodatée.",
  },
  {
    q: "Dois-je comprendre la technique derrière la preuve ?",
    a: "Non. Vous n'avez ni clé, ni portefeuille, ni rien à installer. Vous déposez, vous approuvez, vous signez ; DISTRIB s'occupe du reste et vous remet un certificat vérifiable par n'importe qui.",
  },
  {
    q: "Qui peut voir mes fichiers ?",
    a: "Uniquement vous et les contributeurs que vous invitez sur un projet. En cas de correspondance détectée avec une autre œuvre du vault, seules les deux parties concernées peuvent écouter les extraits comparés.",
  },
];

export default async function FaqPage() {
  const session = await auth();
  const backHref = session?.user ? "/dashboard" : "/";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-14">
      <Link href={backHref} className="text-xs text-black/50 hover:underline dark:text-white/50">
        ← Retour
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Questions fréquentes</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        DISTRIB prouve et organise vos droits. Il ne distribue pas votre musique.
      </p>

      <dl className="mt-10 space-y-8">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-medium">{item.q}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-black/70 dark:text-white/70">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-12 border-t border-black/10 pt-6 text-xs text-black/40 dark:text-white/40">
        <Link href="/cgu" className="underline">
          Conditions générales
        </Link>
        {" · "}
        <Link href="/confidentialite" className="underline">
          Données personnelles
        </Link>
      </p>
    </div>
  );
}
