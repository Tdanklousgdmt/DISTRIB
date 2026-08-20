# DISTRIB — PRD & Spécifications techniques

**Version 1.0 — 18 août 2026**
Document de référence produit, complémentaire au `DISTRIB_MASTER.pdf` v3.0 (avril 2026) et à [`docs/DISTRIB_SYNTHESE.docx`](DISTRIB_SYNTHESE.docx). Rédigé à partir du code réellement livré (dépôt `Tdanklousgdmt/DISTRIB`, 10 commits) — chaque feature est marquée de son état réel, pas de son état souhaité.

**Légende des statuts** : ✅ codé et testé en conditions réelles · ⚠️ codé, fonctionnel en mode dégradé (service externe non provisionné) · ⛔ non fait / reporté après le MVP.

---

## Partie 1 — PRD (Product Requirements Document)

### 1.1 Problème

Un artiste musical indépendant qui s'autoproduit cumule trois statuts juridiques distincts — auteur, interprète, producteur — chacun rattaché à un organisme de gestion différent (SACEM, ADAMI, SCPP/SPPF, SDRM), avec des démarches manuelles que personne n'a le temps de suivre. Deux conséquences concrètes :

1. **Des droits perdus** : concerts jamais déclarés, œuvres jamais soumises, argent qui ne remonte jamais jusqu'à l'artiste.
2. **Aucune preuve de paternité opposable** : en cas de sample non autorisé, de leak, ou de litige entre collaborateurs (qui a écrit quoi, qui a droit à quel pourcentage), l'artiste indépendant n'a généralement rien de daté et de vérifiable par un tiers.

### 1.2 Solution

DISTRIB automatise la chaîne complète : chaque dépôt de fichier dans un vault collaboratif est immédiatement horodaté et — après validation unanime des contributeurs — ancré sur la blockchain Polygon comme preuve d'antériorité publique et permanente. Cette validation déclenche automatiquement les déclarations administratives (SACEM), et chaque nouvel upload est comparé au reste du vault et aux plateformes externes pour détecter les réutilisations non autorisées.

### 1.3 Utilisateurs cibles

| Persona | Besoin |
|---|---|
| **Artiste indépendant (solo)** | Protéger ses créations sans rien comprendre à la blockchain ; ne plus oublier une déclaration SACEM |
| **Collaborateur** (beatmaker, co-auteur, co-beatmaker) | Être crédité et rémunéré équitablement, avec un accord explicite et non oral |
| **Label / avocat / tiers** | Vérifier une preuve d'antériorité ou une réclamation sans dépendre de la parole de DISTRIB — besoin d'un document ou d'une preuve publique indépendante |

### 1.4 Les 5 principes non négociables

Ces règles, définies dans le doc master, priment sur toute décision d'implémentation. Elles ont été respectées à chaque feature (le détail est rappelé dans chaque fiche de la Partie 2).

| # | Principe | Traduction technique |
|---|---|---|
| 1 | Aucun fichier ne peut jamais être supprimé | Pas de colonne `deleted_at` · `DELETE /api/upload` → 403 systématique · bouton absent de l'UI · verrouillage à l'écriture (S3 Object Lock COMPLIANCE ou permissions lecture seule en local) |
| 2 | Smart contract minimal — états et booléens uniquement | Exactement 5 fonctions dans `DistribRegistry.sol`, aucun fonds, aucun token |
| 3 | 2 semaines minimum sur testnet Amoy avant tout mainnet | `POLYGON_NETWORK=amoy` par défaut, aucune exception si une anomalie apparaît |
| 4 | Tout le schéma de données pensé au Sprint 1 | 14 tables métier + 4 tables NextAuth conçues d'un bloc, avant le moindre déploiement de contrat |
| 5 | La blockchain est invisible pour l'artiste | Wallet unique côté serveur (jamais exposé), aucune erreur RPC ne doit faire échouer un flux utilisateur |

### 1.5 Contraintes du projet

- Développeur solo, budget cible 300–500 € sur 8 mois (voir doc master §P7)
- Aucun audit de sécurité externe possible pour le smart contract → minimalisme radical comme seule ligne de défense
- Stack : Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 / PostgreSQL · Auth.js v5 · Tailwind v4 · Solidity 0.8.28 / Hardhat 3 · Polygon (Amoy → mainnet) · ethers.js v6 · pdf-lib · Chromaprint · AudD · Resend · Yousign · Railway

### 1.6 Périmètre livré vs hors-scope MVP

**Livré** (détail Partie 2) : les 5 sprints du doc master sont intégralement codés — fondations, vault collaboratif, smart contract + 19 tests, SACEM auto (œuvre + live), fingerprint + claims + scan externe — plus deux features non prévues dans le doc initial, ajoutées pendant le développement : le **registre blockchain** (attestation lisible par un tiers) et le **Vault global** (vue transversale multi-projets).

**Explicitement hors-scope pour cette version** (reporté, pas oublié) :
- Détection rétroactive des concerts non déclarés sur 12 mois
- Diff visuel entre deux versions d'un même projet
- Extraits audio 15 s côte à côte sur les fiches de réclamation
- Page de vérification publique par transaction (hors app, sans compte) — partiellement couverte par le registre blockchain exportable
- Relances automatiques de signature à 72 h, médiation à 30 jours
- Guide d'inscription pas-à-pas ADAMI / SCPP / SDRM
- Intégrations DSP directes (Content ID YouTube, API Spotify) — AudD sert de proxy MVP pour ce besoin

### 1.7 État de mise en production (18 août 2026)

| Élément | État |
|---|---|
| Base de données | ✅ Postgres local (`prisma dev`) — Supabase prévu pour la prod, non encore branché |
| Stockage fichiers | ✅ Driver local (`.vault/`) actif — S3 codé et prêt, non encore provisionné |
| E-mail (magic link, rappels) | ⚠️ Fallback console (lien affiché dans les logs serveur) — Resend codé, clé non provisionnée |
| Smart contract | ✅ Déployé et vérifié fonctionnel sur Polygon Amoy — `0x3F3B3256467d4aab444e272237a2cc0067431567` |
| Vérification du contrat sur l'explorateur | ⚠️ Procédure fournie à l'utilisateur, confirmation finale non reçue |
| Hébergement public (Railway) | ⛔ Non fait — app accessible en local uniquement |
| Signatures eIDAS (Yousign) | ⚠️ Code prêt, clé non provisionnée — fallback signature manuelle |
| Scan externe (AudD) | ⚠️ Code prêt, clé non provisionnée |
| Décompte des 2 semaines testnet (non-négo #3) | En cours, débute au déploiement du 18/08/2026 — mainnet non envisageable avant le 01/09/2026 |

---

## Partie 2 — Spécifications par feature

### A. Fondations

#### A.1 Authentification

| | |
|---|---|
| **Objectif** | Connexion sans mot de passe — l'e-mail est l'identité, cohérent avec le principe « zéro friction, zéro complexité visible » |
| **Flux** | Saisie e-mail → lien magique à usage unique (24 h) → session en base (30 jours) |
| **Règles métier** | Un compte est créé automatiquement au premier lien envoyé (y compris pour un contributeur invité qui n'a jamais ouvert l'app) |
| **Données** | `User`, `Account`, `Session`, `VerificationToken` (schéma standard Auth.js) |
| **Implémentation** | `src/lib/auth.ts` (Auth.js v5 + `@auth/prisma-adapter`), provider `Resend` custom : sans `RESEND_API_KEY`, le lien est loggé côté serveur au lieu d'être envoyé — l'app reste utilisable en local sans aucun compte e-mail |
| **État** | ✅ Testé de bout en bout (connexion réelle, session persistée) |

#### A.2 Projets (racine du vault)

| | |
|---|---|
| **Objectif** | Conteneur racine d'une œuvre — titre, ISRC optionnel, propriétaire, liste de contributeurs |
| **Règles métier** | Le créateur devient automatiquement premier contributeur avec le rôle `ARTIST` ; l'ISRC est unique s'il est renseigné |
| **Données** | `Project`, `ProjectContributor` |
| **Interfaces** | `/projects` (liste + création), `/projects/[id]` (détail) |
| **Blockchain** | `registerProject()` appelé à la création (voir A.4) |
| **État** | ✅ |

#### A.3 Stockage de fichiers — driver double (S3 / local)

| | |
|---|---|
| **Objectif** | Immuabilité du fichier déposé (principe n°1), avec un mode local utilisable sans compte AWS |
| **Règles métier** | Sélection automatique : S3 si les variables `AWS_*` sont présentes, sinon disque local (`.vault/`) ; dans les deux cas, écrasement refusé et fichier posé en lecture seule après écriture |
| **Limite assumée** | En mode local, l'immuabilité n'est **pas** garantie physiquement (contrairement à S3 Object Lock COMPLIANCE) — seule la voie applicative (API 403, UI sans bouton) protège. La preuve juridique réelle reste le hash ancré on-chain, identique dans les deux modes |
| **Implémentation** | `src/lib/storage.ts` (sélecteur de driver) au-dessus de `src/lib/s3.ts` (Object Lock + legal hold) |
| **État** | ✅ Mode local testé en conditions réelles · ⚠️ mode S3 codé, non provisionné |

#### A.4 Ancrage blockchain — client serveur

| | |
|---|---|
| **Objectif** | Point d'entrée unique entre l'app et Polygon — encapsule le wallet serveur, jamais exposé ailleurs |
| **Fonctions** | `registerProjectOnchain`, `approveVersionOnchain`, `anchorFileHash`, `setPendingClaimOnchain`, `resolveClaimOnchain`, `syncCanPublish`, `getOnchainTxInfo` (lecture seule pour le registre) |
| **Règle non négociable** | Aucune fonction ne lève d'exception vers l'appelant — toute erreur RPC est journalisée et renvoie `null` ; l'ancrage est rejouable plus tard sans bloquer l'artiste (principe n°5) |
| **Identifiants on-chain** | `projectId` on-chain = `keccak256(cuid)` ; hash de version = `keccak256` de la concaténation **triée** des SHA-256 de fichiers (indépendant de l'ordre d'upload, recalculable par n'importe qui) |
| **Implémentation** | `src/lib/blockchain.ts` (ethers v6, provider unique via `ALCHEMY_RPC_URL_AMOY`/`_MAINNET` selon `POLYGON_NETWORK`) |
| **État** | ✅ Testé avec de vraies transactions confirmées sur Amoy |

#### A.5 Santé & déploiement

| | |
|---|---|
| **Objectif** | Diagnostiquer quels services sont provisionnés, sans exposer de secret |
| **Interfaces** | `GET /api/health` → `{ database, storage, resend, blockchain, yousign, audd }` |
| **Déploiement** | `railway.json` : migrations Prisma au démarrage, healthcheck, redémarrage sur échec ; `postinstall` génère le client Prisma |
| **État** | ✅ codé · ⛔ non déployé sur Railway |

---

### B. Pilier 1 — Vault blockchain

#### B.1 Versioning & dépôt

| | |
|---|---|
| **Objectif** | Chaque contribution est déposée avec une description libre horodatée — c'est la preuve de paternité, avant même l'ancrage du fichier |
| **Flux** | Nouvelle version (texte de contribution) → statut `PENDING` → dépôt d'au moins un fichier → finalisation (voir B.3) |
| **Règle corrigée en cours de développement** | Une version solo (1 seul contributeur) ne finalise **plus** à sa création — elle reste `PENDING` tant qu'aucun fichier n'est déposé. *Bug initial découvert en testant le flux réel via navigateur : la version s'ancrait on-chain avant toute preuve.* Corrigé par `finalizeSoloVersionIfReady`, appelée après chaque upload. |
| **Données** | `Version` (numérotation séquentielle par projet, `isCurrent` sur une seule version à la fois — les précédentes passent `OBSOLETE` à la nouvelle approbation) |
| **Interfaces** | Formulaire sur `/projects/[id]` (`NewVersionForm`) + Vault global (`/vault`, dépôt combiné) |
| **État** | ✅ Testé, bug de finalisation prématurée corrigé et revérifié |

#### B.2 Upload & preuve cryptographique

| | |
|---|---|
| **Objectif** | Hash + stockage + ancrage à chaque dépôt, invisible pour l'artiste |
| **Flux** | Fichier → SHA-256 calculé → dédoublonnage si hash déjà connu → stockage verrouillé → `anchorFileHash()` (transaction brute, calldata = hash) → enregistrement `VaultFile` |
| **Pourquoi une tx brute et non un appel de contrat** | Ajouter une fonction au contrat pour l'ancrage par fichier aurait violé le principe n°2 (surface minimale) — la preuve d'antériorité passe donc par une transaction wallet → wallet avec le hash en donnée, horodatée publiquement sans toucher au contrat |
| **Interfaces** | `POST /api/upload` (multipart, max 500 Mo) · `DELETE /api/upload` → 403 systématique (principe n°1) |
| **État** | ✅ |

#### B.3 Flux d'approbation multi-parties

| | |
|---|---|
| **Objectif** | Distribution bloquée tant qu'un contributeur n'a pas validé |
| **Règles métier** | 1 `Approval` par contributeur à chaque version ; créateur auto-approuvé ; **un seul refus** → version `REJECTED` ; **unanimité** → version `APPROVED`, marquée `isCurrent`, ancrée on-chain (`approveVersion()`), les anciennes versions courantes passent `OBSOLETE` |
| **Commentaire** | Chaque décision (approuver/rejeter) peut porter un commentaire libre, conservé et affiché |
| **Interfaces** | Section « Approbations » sur `/projects/[id]` |
| **État** | ✅ |

#### B.4 Répartition des droits (splits)

| | |
|---|---|
| **Objectif** | Rendre explicite, signé et non-oral l'accord de répartition entre contributeurs |
| **Règle métier** | Somme des parts strictement égale à 100 %, vérifiée à **trois niveaux** : interface (calcul live), Zod côté serveur, **trigger SQL différé** en base (`split_sum_must_be_100`) — un simple `CHECK` ne sait pas valider une contrainte multi-lignes |
| **Données** | `Split` (`percentage` en `Decimal(5,2)`, `roleLabel` libre) |
| **État** | ✅ |

#### B.5 Invitations de contributeurs

| | |
|---|---|
| **Objectif** | Ajouter un collaborateur (co-auteur, beatmaker, co-beatmaker, artiste) à un projet |
| **Règle métier** | Réservé au propriétaire ; le compte de l'invité est créé à vide s'il n'existe pas encore — son premier lien magique le connecte directement au bon compte |
| **Limite connue** | Sans `RESEND_API_KEY`, l'invité n'a aucun moyen de recevoir son lien de connexion — le multi-contributeur réel nécessite l'e-mail provisionné |
| **État** | ✅ codé et testé (création de compte) · ⚠️ flux multi-personnes réel bloqué par l'absence d'e-mail sortant |

#### B.6 Notifications

| | |
|---|---|
| **Objectif** | Informer chaque utilisateur des événements le concernant (approbation demandée, version validée/rejetée, réclamation détectée, rappels concert, paiement reçu) |
| **Interfaces** | `/notifications`, badge de non-lues dans la navigation |
| **État** | ✅ |

#### B.7 Smart contract `DistribRegistry`

| | |
|---|---|
| **Objectif** | Registre d'états on-chain minimal, sans audit externe possible → simplicité comme seule garantie de sécurité |
| **Fonctions (exactement 5)** | `registerProject`, `approveVersion`, `canPublish` (lecture publique), `setPendingClaim`, `resolveClaim` |
| **Sécurité** | OpenZeppelin `Ownable` (seul le wallet serveur écrit) + `ReentrancyGuard` sur toutes les fonctions d'écriture ; immuabilité applicative (`approveVersion` refuse d'écraser une version déjà ancrée) |
| **Tests** | 19 tests Hardhat — contrôle d'accès, doubles écritures, cycle complet d'une réclamation, isolation entre projets |
| **Déploiement** | Amoy (testnet), adresse `0x3F3B3256467d4aab444e272237a2cc0067431567`, via Hardhat Ignition |
| **État** | ✅ Déployé, testé avec de vraies transactions · ⛔ mainnet non envisageable avant le 01/09/2026 (principe n°3) |

#### B.8 Registre blockchain (attestation) — *ajouté hors doc master*

| | |
|---|---|
| **Objectif** | Rendre la preuve blockchain lisible et vérifiable par un tiers sans compte DISTRIB (label, avocat) — répond au constat que PolygonScan brut n'est pas exploitable par un non-technicien |
| **Contenu** | Par transaction : Objet, Transaction Hash, Method, **User** (le contributeur DISTRIB à l'origine — distinct des adresses wallet, toujours celle du serveur), Block, Date (absolue, pas de « il y a X minutes » sur un document imprimé), From, To, Amount, Txn Fee |
| **Deux surfaces** | Tableau live dans l'app (`/projects/[id]`, données interrogées en direct sur Polygon, non mises en cache) + export PDF paysage multi-page avec page de vérification (liens PolygonScan cliquables par transaction) |
| **Implémentation** | `src/lib/ledger.ts` (collecte + résolution on-chain), `src/lib/pdf.ts::buildLedgerPdf`, `GET /api/projects/[id]/ledger/pdf` |
| **État** | ✅ Testé avec de vraies transactions, rendu vérifié visuellement (PDF converti en image, tableau en HTML) |

#### B.9 Vault global — *ajouté hors doc master*

| | |
|---|---|
| **Objectif** | Vue transversale de tous les fichiers de l'utilisateur (tous projets confondus), avec dépôt rapide sans naviguer projet par projet |
| **Contenu liste** | Fichier, Projet, Version, Type, Taille, **Utilisateur**, Date de dépôt, statut de preuve (Ancré / En attente) |
| **Dépôt rapide** | Sélection du projet + description de contribution + fichier → crée la version puis l'upload en un geste, en réutilisant exactement les Server Actions et la route `/api/upload` déjà en place (aucune règle métier dupliquée) |
| **Interfaces** | `/vault` (nav) |
| **État** | ✅ Testé (liste + rendu du formulaire) · le champ fichier du dépôt rapide n'a pu être vérifié par clic automatisé (limite technique : sélecteur de fichier natif du système), mais réutilise un chemin de code déjà validé par ailleurs |

---

### C. Pilier 2 — Déclarations automatiques

#### C.1 Déclaration d'œuvre (SACEM)

| | |
|---|---|
| **Objectif** | Bulletin pré-rempli généré dès qu'une version est approuvée à l'unanimité et que la répartition est fixée — zéro ressaisie |
| **Contenu du bulletin** | Titre, ISRC, ayants droit + parts, liste des fichiers avec leur SHA-256, transaction Polygon de l'approbation finale |
| **Flux** | Bouton « Déclarer l'œuvre à la SACEM » sur une version `APPROVED` avec splits → `SacemDeclaration` créée → PDF généré → tentative de signature Yousign (si configurée) |
| **Interfaces** | `/projects/[id]` (bouton), `GET /api/declarations/[id]/pdf` |
| **État** | ✅ Testé, PDF généré et vérifié visuellement |

#### C.2 Déclaration live (concerts)

| | |
|---|---|
| **Objectif** | Ne plus jamais perdre de droits de représentation publique |
| **Règles métier** | Rappels automatiques J-15 / J-5 / J+1 (cron quotidien, idempotent — chaque rappel envoyé une seule fois), déclarable dès J-30 ou après la date |
| **Interfaces** | `/concerts` (création, setlist, déclaration), `GET /api/cron/reminders` (protégé par `CRON_SECRET`) |
| **État** | ✅ codé · ⛔ cron non branché (pas d'hébergement Railway actif) |

#### C.3 Dashboard revenus

| | |
|---|---|
| **Objectif** | Vue unifiée des flux de revenus (droits d'auteur vs droits live), suivi des déclarations (à signer → transmise → payée) |
| **Interfaces** | `/revenus` |
| **État** | ✅ |

#### C.4 Signatures électroniques (Yousign)

| | |
|---|---|
| **Objectif** | Valeur légale eIDAS pour les bulletins SACEM et les splits |
| **Comportement dégradé** | Sans `YOUSIGN_API_KEY`, le flux retombe sur la signature manuelle du PDF téléchargé — aucune fonctionnalité ne casse |
| **État** | ⚠️ codé, non provisionné |

#### C.5 Autres organismes (ADAMI, SCPP/SPPF, SDRM)

| | |
|---|---|
| **Objectif du doc master** | Guide d'inscription par organisme, suivi des flux par source |
| **État** | ⛔ Non implémenté — reporté après le MVP |

---

### D. Pilier 3 — Reconnaissance audio

#### D.1 Empreinte acoustique (Chromaprint)

| | |
|---|---|
| **Objectif** | Détecter une réutilisation même si le fichier est pitché, ralenti ou découpé — complémentaire au hash SHA-256 (qui ne détecte qu'une copie strictement identique) |
| **Flux** | Calculée **après la réponse HTTP** de l'upload (`after()`), donc invisible en latence pour l'artiste ; no-op silencieux si `fpcalc` n'est pas installé sur la machine |
| **Comparaison** | Distance de Hamming avec tolérance d'alignement (±40 fenêtres ≈ intro coupée), seuil de similarité 85 % |
| **Données** | `Fingerprint` (empreinte en binaire compact) |
| **État** | ⚠️ codé, dépend d'un binaire externe (`fpcalc`) non confirmé installé sur la machine de déploiement cible |

#### D.2 Détection interne & réclamations (claims)

| | |
|---|---|
| **Objectif** | Une correspondance ≥ seuil entre le vault d'un projet et celui d'un autre déclenche une réclamation automatique |
| **Règles métier** | L'original = le fichier le plus ancien ; le nouvel arrivant devient « claimant » ; sa publication est bloquée (BDD **et** `setPendingClaim()` on-chain) tant que la réclamation n'est pas résolue ; les deux parties sont notifiées |
| **Résolution (3 actions, conformes au doc)** | **Autoriser** (`resolveClaim()` on-chain, déblocage) · **Négocier un split** · **Signaler** (litige, `DISPUTED`) — réservé au propriétaire du fichier original |
| **Données** | `Claim` (`similarityScore`, `status`, `resolutionAction`) |
| **Interfaces** | `/claims` |
| **État** | ✅ codé et couvert par la logique métier · ⚠️ jamais déclenché en conditions réelles (aucun doublon testé faute de fpcalc confirmé en environnement de test) |

#### D.3 Scan externe (AudD)

| | |
|---|---|
| **Objectif** | Détecter la présence non déclarée d'un extrait sur Spotify, Apple Music, Deezer |
| **Règles métier** | Cron quotidien plafonné à 10 fichiers/jour (quota gratuit 500 requêtes/mois) ; fichiers jamais scannés priorisés |
| **Données** | `ExternalMatch` (ajoutée par la 4ᵉ migration, anticipée dès le schéma Sprint 1) |
| **Interfaces** | `GET /api/cron/scan` (protégé), section « Plateformes externes » sur `/claims` |
| **État** | ⚠️ codé, non provisionné (clé AudD absente, nécessite aussi S3 pour générer une URL présignée) |

---

## Annexes

### Modèle de données (18 tables)

`User`, `Account`, `Session`, `VerificationToken` (NextAuth) · `Project`, `ProjectContributor`, `Version`, `VaultFile`, `Approval`, `Split` (vault) · `Concert`, `SacemDeclaration` (déclarations) · `Fingerprint`, `Claim`, `ExternalMatch` (reconnaissance audio) · `Notification`.

### Routes API

| Route | Rôle |
|---|---|
| `POST/DELETE /api/upload` | Dépôt de fichier · suppression toujours refusée |
| `GET /api/health` | État des services provisionnés |
| `GET /api/declarations/[id]/pdf` | Bulletin SACEM |
| `GET /api/projects/[id]/ledger/pdf` | Registre blockchain exportable |
| `GET /api/cron/reminders` | Rappels concerts J-15/J-5/J+1 |
| `GET /api/cron/scan` | Scan AudD quotidien |
| `* /api/auth/[...nextauth]` | Auth.js |

### Variables d'environnement (18)

Voir `.env.example` — regroupées par service : base de données (`DATABASE_URL`, `DIRECT_URL`), auth (`AUTH_SECRET`, `AUTH_URL`), e-mail (`RESEND_API_KEY`, `EMAIL_FROM`), stockage (`AWS_*`, `STORAGE_DRIVER`, `VAULT_LOCAL_DIR`), blockchain (`ALCHEMY_RPC_URL_AMOY`/`_MAINNET`, `SERVER_WALLET_PRIVATE_KEY`, `MASTER_CONTRACT_ADDRESS`, `POLYGON_NETWORK`), signatures (`YOUSIGN_*`), reconnaissance (`AUDD_API_TOKEN`), crons (`CRON_SECRET`).

### Références déployées (Amoy)

- Contrat `DistribRegistry` : `0x3F3B3256467d4aab444e272237a2cc0067431567`
- Wallet serveur : `0xED2a9C2c3DD0BA7f28a92A824D0fcF2DB4032556`
- Explorateur : https://amoy.polygonscan.com/address/0x3F3B3256467d4aab444e272237a2cc0067431567

### Coûts réels sur Polygon mainnet (snapshot 19 août 2026)

Estimation à partir de la consommation de gas **réellement mesurée** sur les transactions Amoy (le contrat mainnet sera identique) et du prix du gas mainnet interrogé en direct ce jour-là (deux lectures indépendantes, 270-280 gwei — stable, pas un pic isolé) et du cours du POL (~0,108 €).

| Transaction | Gas consommé | Coût |
|---|---|---|
| Ancrage d'un fichier (`anchorFileHash`) | 24 160 | ~0,0007 € |
| Approbation de version (`approveVersion`) | 92 546 | ~0,0028 € |
| Enregistrement d'un projet (`registerProject`, estimation) | ~60 000 | ~0,0018 € |

Un cycle complet (dépôt + approbation finale) coûte donc **~0,0035 €** — le budget de ~20 € de POL prévu par le doc master couvre plusieurs milliers de transactions à ce niveau de prix.

⚠️ **Le gas Polygon est volatile.** Ce tableau est une photo à un instant T, pas une garantie permanente — revérifier le prix du gas à plusieurs moments avant le passage en mainnet plutôt que de se fier à un seul relevé.

---

*Document généré à partir du code du dépôt `Tdanklousgdmt/DISTRIB` et de l'historique de développement au 18 août 2026. À mettre à jour à chaque changement de périmètre.*
