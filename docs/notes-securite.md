# Sécurité & mise en prod — fiche mémo

Notes simples pour me rappeler ce qui a été fait sur le back côté sécurité
et déploiement, et pouvoir l'expliquer sans me prendre la tête.

---

## TL;DR — l'essentiel en 1 minute

Mon API est protégée à plusieurs niveaux : **headers HTTP**, **CORS**,
**rate limiting**, **validation des entrées**, **mots de passe hashés**,
**JWT**, **logs**, **gestion d'erreur propre**, et **variables d'env validées**.
Côté prod, tout est décrit dans `render.yaml` et démarre proprement avec
les migrations + des health checks.

---

## 1. Sécurité — ce que j'ai mis en place

### a) Headers HTTP — `helmet`
- Une ligne dans `server.ts` : `app.use(helmet())`.
- Ça ajoute automatiquement plein de headers HTTP qui bloquent des attaques
  classiques (XSS, clickjacking, MIME sniffing, etc.).
- **À retenir :** je n'écris pas les headers à la main, helmet le fait pour moi
  avec des valeurs par défaut sûres.

### b) CORS — qui a le droit d'appeler mon API
- Seul mon frontend (`FRONTEND_URL`) peut taper sur l'API depuis un navigateur.
- Si une autre origine essaie → réponse rejetée par CORS.
- **À retenir :** ça empêche n'importe quel site d'utiliser l'API depuis le
  navigateur d'un user connecté.

### c) Rate limiting — anti brute-force
Sur les routes sensibles (`/login`, `/register`) :
- **Login** : max 5 tentatives toutes les 15 minutes par IP.
- **Register** : max 3 inscriptions par heure par IP.
- **À retenir :** ça bloque les attaques par essais répétés
  (deviner un mot de passe, spammer des comptes).

### d) Validation des entrées — `zod`
- Chaque body reçu (register, login) est validé par un schéma Zod
  *avant* d'arriver au service.
- Si les données sont invalides → 400 avec un message clair.
- **À retenir :** je ne fais jamais confiance au client. Données mal formées =
  rejetées au plus tôt.

### e) Mots de passe — `bcrypt`
- Jamais stockés en clair.
- Hash bcrypt avec 10 rounds de salt.
- Ne sont jamais renvoyés dans une réponse (`select` Prisma sans le champ).
- **À retenir :** même si quelqu'un dump la BDD, il ne récupère pas les mots
  de passe.

### f) Authentification — JWT
- À la connexion, le serveur signe un token JWT avec `JWT_SECRET`.
- Le client le renvoie dans le header `Authorization: Bearer ...`.
- Un middleware `authMiddleware` vérifie la signature et extrait le `userId`.
- Token valable 7 jours (`JWT_EXPIRES_IN`).
- **À retenir :** stateless — pas de session côté serveur, juste un token signé.

### g) Variables d'environnement validées au boot — Zod
- `src/config/env.ts` valide toutes les vars au démarrage.
- Si `JWT_SECRET` fait moins de 32 caractères ou si `DATABASE_URL` manque →
  l'app **refuse de démarrer**.
- **À retenir :** mieux vaut crasher au boot que tourner avec une config
  pourrie (genre un JWT_SECRET vide en prod).

### h) Logs — `winston`
- Toutes les requêtes HTTP sont loggées (méthode, URL, status).
- Les erreurs vont dans `logs/error.log` + console.
- Format JSON en prod (lisible par les outils d'observability).
- **À retenir :** sans logs, je suis aveugle quand quelque chose casse en prod.

### i) Gestion d'erreur globale
- Un middleware `errorHandler` attrape toutes les erreurs non gérées.
- Il les log et renvoie une réponse générique `500 - Erreur serveur interne`.
- **À retenir :** je ne fuite jamais de stack trace ou de détails internes
  vers le client (sécurité + propreté).

---

## 2. Mise en prod — ce qui a été fait

Voir aussi [`notes-deploiement.md`](notes-deploiement.md) pour les détails infra.

### a) `render.yaml` — Infrastructure as Code
- Décrit le service web + la BDD PostgreSQL + les variables d'env.
- Render lit ce fichier et provisionne tout automatiquement.
- `JWT_SECRET` généré par Render (`generateValue: true`) → je ne vois jamais
  cette valeur, elle n'apparaît dans aucun fichier.
- `DATABASE_URL` injectée automatiquement depuis la BDD du blueprint.

### b) Scripts npm pour la prod
- `postinstall: prisma generate` → le client Prisma est généré auto à chaque
  install (sinon le build TS plante).
- `start: prisma migrate deploy && node ...` → applique les migrations en
  attente avant de lancer le serveur.

### c) Health checks séparés (pattern Kubernetes)
- `/health` (liveness) : "le process tourne ?" — réponse rapide, sans BDD.
- `/ready` (readiness) : "l'API peut servir ?" — check la BDD avec `SELECT 1`.
- **Pourquoi :** si la BDD a un hoquet, on ne redémarre pas l'API pour rien.

### d) `.env.example` versionné, `.env` ignoré
- Le template des variables est dans le repo (sans valeurs).
- Les vraies valeurs vivent dans Render (prod) ou `.env` local (jamais commité).

---

## 3. Ce que je peux dire en entretien

> *"J'ai sécurisé l'API à plusieurs couches : helmet pour les headers HTTP,
> CORS strict, rate limiting sur les routes d'auth, validation Zod sur toutes
> les entrées, bcrypt pour les mots de passe, JWT pour l'auth stateless,
> et un middleware global qui catch les erreurs sans fuiter d'info.
> Côté prod, tout est décrit en Infrastructure as Code dans un `render.yaml`,
> avec des health checks séparés (liveness/readiness) façon Kubernetes,
> et les migrations Prisma s'appliquent automatiquement au démarrage."*

---

## 4. Récap visuel des couches

```
Requête entrante
   ↓
[ helmet ]            → headers HTTP sûrs
   ↓
[ CORS ]              → seule mon origine frontend passe
   ↓
[ rate limiter ]      → max N tentatives par IP (sur /login, /register)
   ↓
[ JSON parser ]       → parse le body
   ↓
[ logger HTTP ]       → log méthode + URL + status
   ↓
[ route ]
   ↓
[ Zod validation ]    → données malformées → 400
   ↓
[ auth middleware ]   → vérifie le JWT (sur routes protégées)
   ↓
[ controller ]
   ↓
[ service + Prisma ]  → BDD (mots de passe hashés bcrypt)
   ↓
Réponse
   ↳ si erreur non gérée → errorHandler → log + 500 générique
```

---

## 5. Ce que je n'ai PAS encore fait (pour être honnête)

- Pas de tests automatisés.
- Pas de CI/CD GitHub Actions (lint + tests + audit npm).
- Pas de refresh tokens (juste un JWT 7 jours).
- Pas de 2FA.
- Pas de monitoring externe (Sentry, etc.).
- Pas de Dockerfile (étape suivante vers k8s).

→ Améliorations possibles à mentionner si on me pose la question.
