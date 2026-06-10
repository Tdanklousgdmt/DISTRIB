# DISTRIB

Protection blockchain des droits musicaux, déclarations SACEM automatisées
et reconnaissance audio — du concept au code.

> Spécification de référence : `DISTRIB_MASTER.pdf` v3.0 (avril 2026).

## Stack

| Couche        | Choix                                      | Notes                                                |
| ------------- | ------------------------------------------ | ---------------------------------------------------- |
| Frontend      | Next.js 16 · App Router · React 19 · TS    | Le doc spécifie Next 14, on est sur 16 (latest 2026) |
| UI            | Tailwind CSS v4                            | PostCSS pipeline                                     |
| BDD           | Supabase Postgres + Prisma 7               | Datasource URL via `prisma.config.ts`                |
| Auth          | NextAuth (Auth.js v5) + Prisma adapter     | Magic link via Resend                                |
| Stockage      | AWS S3 + Object Lock COMPLIANCE            | Activer Object Lock à la création du bucket          |
| Blockchain    | Solidity + Hardhat → Polygon (Amoy → main) | Via Alchemy RPC + ethers.js                          |
| Signatures    | Yousign (eIDAS)                            | Splits + bulletins SACEM                             |
| Email         | Resend                                     | Magic links + rappels concerts                       |
| PDF           | pdf-lib                                    | Bulletins SACEM + certificats                        |
| Fingerprint   | Chromaprint (`fpcalc`)                     | Empreinte acoustique par fichier                     |
| Scan externe  | AudD API                                   | 500 req/mois gratuits — passer ACRCloud à 1k+        |
| Déploiement   | Railway                                    | ~5 €/mois                                            |

## 5 principes non-négociables

1. **Aucune suppression de fichier — jamais.** Pas de `deleted_at`, API DELETE → HTTP 403, S3 Object Lock COMPLIANCE, bouton absent UI.
2. **Smart contract minimal.** Pas de fonds, pas de tokens — uniquement états et booléens. OpenZeppelin Ownable + ReentrancyGuard.
3. **2 semaines testnet Amoy obligatoires** avant tout déploiement mainnet. Un test qui plante = pas de déploiement.
4. **Tout le schéma BDD pensé en Sprint 1.** Seul moment où changer la structure est gratuit.
5. **Blockchain invisible pour l'artiste.** Wallet serveur, complexité cachée — l'utilisateur voit « fichier protégé », rien d'autre.

## Roadmap

| Sprint | Période  | Durée   | Livrable                                                              |
| ------ | -------- | ------- | --------------------------------------------------------------------- |
| 1      | M1–M2    | 8 sem   | App · auth · upload S3 · schéma BDD — ✅ _codé (provisioning à faire)_ |
| 2      | M2–M3    | 6 sem   | Vault collaboratif · approbations · splits — ✅ _codé (Yousign S4)_    |
| 3      | M4–M6    | 10 sem  | Smart contract + tests — ✅ _codé (19 tests) · déploiement Amoy à faire_ |
| 4      | M6–M7    | 6 sem   | SACEM œuvres + live · calendrier · dashboard revenus unifié           |
| 5      | M7–M8    | 6 sem   | Fingerprint Chromaprint · scan AudD · interface claims                |

## Setup local

### Prérequis

- Node ≥ 20 (testé sur 24)
- npm ≥ 10
- Un projet Supabase (gratuit)

### Étapes

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'env
cp .env.example .env.local
# Remplir au minimum DATABASE_URL et DIRECT_URL (Supabase pooler + session).
# Générer AUTH_SECRET : openssl rand -base64 32

# 3. Générer le client Prisma + appliquer les migrations (déjà écrites)
npx prisma generate
npx prisma migrate deploy   # ou `migrate dev` pour un environnement de dev

# 4. Lancer le serveur de dev
npm run dev

# 5. (Smart contract) compiler et tester
cd contracts && npm install && npm test
```

### Variables d'env critiques

Voir `.env.example` pour la liste complète. Les seules requises pour faire
tourner le scaffold actuel : `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`.

## Structure du projet

```
distrib/
├── prisma/
│   ├── schema.prisma         # 10 tables business + 4 tables NextAuth
│   └── migrations/           # init + contrainte splits (somme = 100, trigger déféré)
├── prisma.config.ts          # datasource URL + dotenv loader
├── contracts/                # workspace Hardhat 3 (npm séparé)
│   ├── contracts/DistribRegistry.sol   # 5 fonctions, OpenZeppelin, 0 fonds
│   ├── test/DistribRegistry.ts         # 19 tests
│   └── ignition/modules/               # déploiement Amoy → mainnet
├── src/
│   ├── app/                  # App Router (landing, (auth), (app), routes API)
│   ├── lib/
│   │   ├── prisma.ts         # singleton client (driver adapter pg)
│   │   ├── auth.ts           # Auth.js v5 magic link (Resend)
│   │   ├── s3.ts             # vault S3 Object Lock COMPLIANCE
│   │   ├── vault.ts          # flux d'approbation multi-parties
│   │   └── blockchain.ts     # ethers.js — ancrage Polygon (wallet serveur)
│   └── generated/prisma/     # client Prisma (gitignored)
├── public/
└── .env.example              # template — copier en .env.local
```

## Notes techniques

- **Prisma 7 + Next.js** : le client est généré dans `src/generated/prisma`
  (et non `node_modules`). Important : ne pas commit ce dossier (déjà ignoré).
- **URL Supabase** : utiliser le pooler (port 6543, `?pgbouncer=true`) pour
  `DATABASE_URL`, et la connexion directe (port 5432) pour `DIRECT_URL` —
  les migrations Prisma ne tolèrent pas pgbouncer.
- **S3 Object Lock** : ne peut être activé qu'à la **création** du bucket.
  Si tu provisionnes le bucket plus tard, vérifie ce point avant tout upload.

## Confidentialité

Document source DISTRIB_MASTER v3.0 — Confidentiel.
