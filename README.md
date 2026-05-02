# Lotofolio — API Backend

API REST de gestion de loto développée en **Node.js / TypeScript / Express 5 / Prisma 7 / PostgreSQL**.

Projet personnel conçu comme une vitrine technique : architecture en couches, sécurité applicative, validation forte des entrées, logs structurés et configuration typée. Pensé dès le départ pour être lisible, testable et déployable en production.

> Ce dépôt contient uniquement le **backend**. Le frontend Angular associé se trouve dans le dépôt `loto-frontend`.

---

## Sommaire

- [Démo](#démo)
- [Stack technique](#stack-technique)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Modèle de données](#modèle-de-données)
- [Sécurité](#sécurité)
- [Lancer le projet en local](#lancer-le-projet-en-local)
- [Endpoints API](#endpoints-api)
- [Choix techniques justifiés](#choix-techniques-justifiés)
- [Roadmap](#roadmap)
- [À propos](#à-propos)

---

## Démo

| Environnement | URL                                   | Statut         |
| ------------- | ------------------------------------- | -------------- |
| Production    | _à venir (déploiement Railway/Render)_ | 🚧 En cours    |
| Local         | `http://localhost:3000`               | ✅ Disponible  |

> Sondes : `GET /health` (liveness, le process répond) — `GET /ready` (readiness, BDD joignable).

---

## Stack technique

### Cœur applicatif
- **Node.js 24** + **TypeScript 5** (mode `strict`, ESM natif)
- **Express 5** (dernière version stable, support natif des `async` handlers)
- **Prisma 7** (ORM type-safe) + **PostgreSQL 16** via l'adaptateur `@prisma/adapter-pg`

### Sécurité & robustesse
- **JWT** (`jsonwebtoken`) — authentification stateless
- **bcrypt** — hash des mots de passe (10 salt rounds)
- **Helmet** — durcissement des en-têtes HTTP
- **CORS** — allowlist d'origines configurable
- **express-rate-limit** — protection brute-force sur `/login` et `/register`
- **Zod** — validation runtime des `req.body` **et** des variables d'environnement

### Observabilité & DX
- **Winston** — logger structuré (JSON en production, coloré en dev) + transport fichier pour les erreurs
- **dotenv** + schéma Zod — toute variable manquante ou invalide bloque le démarrage avec un message clair
- **tsx** — hot reload en développement sans étape de build

---

## Fonctionnalités

### Implémentées
- ✅ **Authentification complète** (`/api/auth`)
  - `POST /register` — inscription avec validation forte (email, password ≥ 8, username 2–30)
  - `POST /login` — connexion avec rate limiting (5 tentatives / 15 min)
  - `GET /me` — profil de l'utilisateur connecté (route protégée)
- ✅ **Gestion des jeux** (`/api/jeux`)
  - Listing des jeux disponibles avec leurs règles (intervalle de numéros, nb de numéros à tirer, etc.)
- ✅ **Healthcheck** (`/health`) — utile pour les sondes Kubernetes / Railway
- ✅ **Gestion d'erreurs centralisée** — middleware Express dédié + log automatique de la stack

### En cours / planifié
- 🚧 CRUD **Grilles** — création et gestion des grilles utilisateur
- 🚧 CRUD **Tirages** — génération aléatoire de tirages
- 🚧 **Parties** — jouer une grille sur un tirage (avec contrainte d'unicité `grille × tirage`)
- 🚧 **Résultats & gains** — calcul automatique du rang et du gain selon les règles du Loto
- 🚧 Tests d'intégration (Vitest + Supertest)
- 🚧 CI/CD GitHub Actions + déploiement automatique

---

## Architecture

Architecture **en couches** classique, claire, qui permet à n'importe quel développeur de retrouver instantanément où se trouve une responsabilité :

```
┌──────────────────────────────────────────────────────────┐
│                    HTTP Request                          │
└────────────────────────┬─────────────────────────────────┘
                         ▼
              ┌─────────────────────┐
              │   Middlewares       │  helmet, cors, json
              │   (transversaux)    │  rateLimit, auth (JWT)
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │      Routes         │  src/routes/*.routes.ts
              │  (Express Router)   │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │    Controllers      │  src/controllers/*.controller.ts
              │  (validation Zod,   │  Pas de logique métier ici.
              │   gestion HTTP)     │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │     Services        │  src/services/*.service.ts
              │   (logique métier)  │  Indépendants d'Express.
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │   Prisma Client     │  src/lib/prisma.ts (singleton)
              │   (accès données)   │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │    PostgreSQL       │
              └─────────────────────┘
```

### Pourquoi ce découpage ?
- **Controllers** ne touchent jamais à la DB directement → testables en isolation.
- **Services** ne connaissent pas Express (`req`, `res`) → réutilisables (ex : pour un futur worker, une CLI, un cron).
- **Erreurs métier** sont remontées via des codes typés (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `USER_NOT_FOUND`) puis traduites en HTTP par les controllers — le service ne pollue pas son code avec du HTTP.

### Arborescence

```
src/
├── config/          # Validation des variables d'env via Zod
│   └── env.ts
├── controllers/     # Couche HTTP (parsing, validation, codes statut)
├── services/        # Logique métier pure
├── routes/          # Définition des routes Express
├── middleware/      # auth (JWT), rateLimit, errorHandler
├── lib/             # Singletons techniques (prisma, logger Winston)
├── utils/           # Helpers (excludePassword, etc.)
└── server.ts        # Point d'entrée
prisma/
├── schema.prisma    # Modèle de données
├── migrations/      # Migrations versionnées
└── seed.ts          # Données de démo
```

---

## Modèle de données

```
┌──────┐         ┌────────┐         ┌──────────┐
│ User │ 1───n  │ Partie │  n───1  │ Tirage   │
└──────┘         └────────┘         └──────────┘
                     │                    │ n
                     │ n                  │
                     │ 1                  │ 1
                 ┌────────┐           ┌─────┐
                 │ Grille │           │ Jeu │
                 └────────┘           └─────┘
                     │ 1
                     │ 1
                 ┌──────────┐
                 │ Resultat │
                 └──────────┘
```

| Entité     | Rôle                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| `User`     | Compte utilisateur (avec rôle `USER`/`ADMIN`)                                   |
| `Jeu`      | Type de loterie (Loto, Euromillions…) + ses règles (plages, nb de numéros)      |
| `Grille`   | Combinaison choisie par un joueur                                               |
| `Tirage`   | Numéros gagnants pour un jeu à une date donnée                                  |
| `Partie`   | Liaison `User × Grille × Tirage` (l'acte de jouer)                              |
| `Resultat` | Résultat calculé d'une partie (numéros corrects, rang, gain)                    |

**Conventions :** champs en `camelCase` côté code, `snake_case` côté SQL via `@map()` Prisma. Tables au pluriel français (`jeux`, `tirages`, `parties`).

---

## Sécurité

| Menace                  | Mesure mise en place                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| Vol de mots de passe    | `bcrypt` (10 rounds) — jamais retourné dans les réponses (`excludePassword()`)   |
| Brute-force `/login`    | `express-rate-limit` : 5 tentatives / 15 min par IP                              |
| Spam d'inscription      | `express-rate-limit` : 3 inscriptions / heure par IP                             |
| Injection SQL           | Prisma (requêtes paramétrées par construction, jamais de SQL concaténé)          |
| XSS / clickjacking      | `helmet` (CSP, X-Frame-Options, etc.)                                            |
| Origines non autorisées | `cors` avec **allowlist** lue depuis `FRONTEND_URL` (refus explicite sinon)      |
| Payload invalide        | `Zod` valide chaque body, retourne `400` avec détails par champ                  |
| Token compromis         | JWT signé `HS256`, expiration 7 jours, secret ≥ 32 caractères imposé par Zod    |
| Variables d'env         | Schéma Zod : démarrage avorté si `JWT_SECRET` < 32 chars ou `DATABASE_URL` invalide |
| Fuite d'erreurs         | `errorHandler` global : log complet côté serveur, message générique côté client  |

---

## Lancer le projet en local

### Prérequis
- **Node.js ≥ 24**
- **PostgreSQL ≥ 14** (local ou via Docker)
- **npm** (ou pnpm / bun)

### 1. Cloner & installer

```bash
git clone https://github.com/HostLabDeezek/lotofolio-back
cd loto-backend
npm install
```

### 2. Configurer l'environnement

Créer un fichier `.env` à la racine :

```dotenv
DATABASE_URL="postgresql://postgres:@localhost:5432/loto_API"
JWT_SECRET="<une_chaine_aleatoire_de_32_caracteres_minimum>"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:4200"
```

> Astuce : générer un secret avec `openssl rand -hex 32`.

### 3. Initialiser la base

```bash
npx prisma migrate dev    # applique les migrations
npx tsx prisma/seed.ts    # injecte un user, un jeu et un tirage de démo
```

### 4. Démarrer

```bash
npm run dev      # mode développement (hot reload via tsx watch)
# ou
npm run build && npm start    # mode production
```

L'API écoute sur `http://localhost:3000`. Vérification :

```bash
curl http://localhost:3000/health
# → { "status": "OK", "database": "Connected" }
```

---

## Endpoints API

> Documentation complète : voir [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

### Authentification

| Méthode | Route                | Auth | Description                  |
| ------- | -------------------- | :--: | ---------------------------- |
| `POST`  | `/api/auth/register` |  ❌  | Créer un compte              |
| `POST`  | `/api/auth/login`    |  ❌  | Connexion (retourne un JWT)  |
| `GET`   | `/api/auth/me`       |  ✅  | Profil de l'utilisateur     |

### Jeux

| Méthode | Route        | Auth | Description                  |
| ------- | ------------ | :--: | ---------------------------- |
| `GET`   | `/api/jeux`  |  ✅  | Liste des jeux disponibles  |

### Système

| Méthode | Route      | Description                                   |
| ------- | ---------- | --------------------------------------------- |
| `GET`   | `/`        | Heartbeat                                     |
| `GET`   | `/health`  | Liveness probe (process en vie)               |
| `GET`   | `/ready`   | Readiness probe (BDD joignable)               |

### Exemple d'appel

```bash
# Inscription
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jean@example.com","password":"Password1!","username":"Jean"}'

# Réponse
{
  "message": "Utilisateur créé avec succès",
  "user": { "id": 1, "email": "jean@example.com", "username": "Jean", "role": "USER" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Choix techniques justifiés

> Quelques décisions clés et leur motivation, parce qu'un README qui dit *"j'utilise X"* sans dire *pourquoi* ne sert à rien.

**Pourquoi TypeScript en mode `strict` ?**
Pour attraper en compilation 80 % des bugs de runtime (typos, `undefined` non gérés, mauvais type de retour). Le coût initial est largement amorti dès qu'on touche à un modèle Prisma — l'auto-complétion sur les relations et les `select` est inégalable.

**Pourquoi Prisma 7 plutôt que TypeORM ou Knex ?**
Type-safety bout-en-bout (le client est généré à partir du schéma), migrations versionnées propres, et excellente DX (`prisma studio`, formatage automatique du schema). Le coût : un petit overhead runtime, négligeable pour ce projet.

**Pourquoi Zod et pas `class-validator` / `joi` ?**
Une seule lib pour valider **les requêtes HTTP** *et* **les variables d'env**, avec inférence TypeScript native (`z.infer<typeof Schema>`). Pas besoin de décorateurs ni de `reflect-metadata`.

**Pourquoi un singleton Prisma ?**
Pour éviter d'épuiser le pool de connexions en hot-reload (problème fréquent avec `tsx watch`). Le singleton est instancié une seule fois et nettoyé proprement sur `SIGINT` / `SIGTERM`.

**Pourquoi des codes d'erreur typés (`EMAIL_TAKEN`, …) ?**
Pour découpler la couche métier de la couche HTTP. Le service `auth.service.ts` n'a **jamais** besoin de connaître les codes 400/401/404 — le controller traduit. Si demain on expose un client gRPC ou un worker, la logique reste intacte.

**Pourquoi Winston plutôt que `console.log` ?**
Logs structurés en JSON en production → parsables par n'importe quel agrégateur (Datadog, Loki, CloudWatch). Logs colorés en dev pour le confort. Niveaux configurables.

---

## Roadmap

- [ ] CRUD complet **Grilles / Tirages / Parties / Résultats**
- [ ] Calcul automatique du gain selon les rangs du Loto
- [ ] Tests d'intégration (Vitest + Supertest, base de test isolée)
- [ ] OpenAPI/Swagger auto-généré
- [ ] CI GitHub Actions (lint + tests + audit npm)
- [ ] Déploiement Railway/Render avec migrations automatiques
- [ ] Métriques Prometheus + dashboard Grafana
- [ ] Refresh tokens (rotation) en plus du JWT court

---

## À propos

Ce projet a été développé dans le cadre de mon portfolio pour mettre en pratique :

- L'**architecture en couches** d'une API Node moderne
- Les **bonnes pratiques de sécurité** côté backend (OWASP top 10)
- La **validation forte** côté frontière (entrées HTTP + env)
- Une **modélisation relationnelle** non triviale (cardinalités, contraintes d'unicité)
- L'**observabilité** (logs structurés, healthcheck, gestion d'erreurs centralisée)

### Auteur

**Simon Péré** — Développeur Full Stack
Actuellement en recherche d'opportunités.

📧 simon.pere@live.fr
🔗 [LinkedIn](https://www.linkedin.com/in/simon-pere-6430331b8/) · [Portfolio](#)

> N'hésitez pas à me contacter pour échanger sur les choix techniques ou explorer le code en détail.
