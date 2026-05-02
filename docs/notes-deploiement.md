# Notes de déploiement & infra — fiche mémo

Notes personnelles pour me souvenir des concepts vus pendant la mise en prod.

---

## TL;DR — l'essentiel en 1 minute

Lis juste cette section pour te remettre dans le bain. Le reste du doc, c'est le détail.

### Ce qu'on a fait
- **Mon API parle à PostgreSQL.** Pour la déployer sur Render, j'ai dû ajouter trois choses au backend.

### 1. Le client Prisma se génère tout seul
- Prisma a besoin d'un fichier généré (`generated/`) que je ne commit pas dans git.
- J'ai ajouté `"postinstall": "prisma generate"` dans `package.json` → npm le génère **automatiquement** après chaque `npm install`, en local comme sur Render.
- **À retenir :** sans ça, le build TypeScript plante en prod.

### 2. Les migrations s'appliquent au démarrage
- En local je fais `npx prisma migrate dev` à la main pour appliquer mes changements de schéma. En prod, personne ne le fait à ma place.
- J'ai mis `prisma migrate deploy &&` dans le script `start` → ça applique les migrations en attente avant de lancer le serveur.
- **À retenir :** `migrate dev` = local (crée des migrations), `migrate deploy` = prod (applique seulement).

### 3. Les health checks sont séparés
- `/health` = "le process Node tourne ?" → réponse rapide, sans BDD.
- `/ready` = "l'API peut servir du trafic ?" → check la BDD avec `SELECT 1`.
- **À retenir :** c'est le pattern standard de Kubernetes. Si la BDD a un hoquet, on ne redémarre pas l'API pour rien.

### 4. L'infra est décrite dans `render.yaml`
- Au lieu de configurer Render à la souris, j'ai un fichier YAML versionné qui décrit le service web + la BDD + les variables d'env.
- Render lit ce fichier et provisionne tout automatiquement.
- **À retenir :** ça s'appelle **Infrastructure as Code (IaC)** — même philosophie que Terraform ou Kubernetes, en plus simple.

### Le vocabulaire qu'on m'a appris
- **Liveness / Readiness** = "vivant" / "prêt à servir"
- **IaC** = décrire l'infra dans des fichiers, pas dans une UI
- **Kubernetes** = orchestrateur de conteneurs pour les grosses boîtes (Render l'utilise en coulisse)
- **PaaS** = Platform as a Service (Render, Heroku) — j'écris du code, ils gèrent les serveurs
- **Déclaratif** = je décris l'état final, l'outil trouve comment y aller (vs **impératif** = je décris les étapes)

---

## 1. Health check : `/health` vs `/ready`

### Le problème
Avant, `/health` faisait une requête SQL (`SELECT 1`). Render ping cet endpoint toutes les 30s pour vérifier que l'API tourne. Conséquences :
- ~2880 requêtes SQL inutiles par jour
- Si la BDD avait un hoquet → Render pensait que l'API était morte → redémarrait l'instance pour rien
- Petite surface d'attaque : un endpoint public qui déclenche du SQL

### La règle (standard Kubernetes)

| Endpoint  | Nom technique | Question                           | Si KO                                                    |
| --------- | ------------- | ---------------------------------- | -------------------------------------------------------- |
| `/health` | **Liveness**  | "Le process Node tourne-t-il ?"    | L'orchestrateur **redémarre** l'instance                 |
| `/ready`  | **Readiness** | "Peut-elle servir du trafic ?"     | L'orchestrateur **arrête de router** du trafic vers elle |

**Différence clé :** une app peut être vivante mais pas prête (BDD down temporairement). Pas besoin de la tuer, juste de la sortir du pool de load balancing.

### Le code

```typescript
// Léger : pas d'I/O, pas de BDD
app.get('/health', (_req, res) => res.json({ status: 'OK' }));

// Vérifie les dépendances critiques
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(503).json({ status: 'ERROR' });   // 503 = Service Unavailable
  }
});
```

### Ce que je dis en entretien
> *"J'ai séparé liveness et readiness selon le pattern Kubernetes pour éviter les restarts en cascade quand une dépendance externe a un hoquet."*

---

## 2. Scripts npm pour le déploiement Render

### Modifications faites dans `package.json`

```json
"scripts": {
  "build": "tsc",
  "start": "prisma migrate deploy && node ./dist/src/server.js",
  "dev": "tsx watch src/server.ts",
  "postinstall": "prisma generate"
}
```

### Pourquoi chaque ligne

| Script         | Rôle                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `postinstall`  | Hook npm auto-déclenché après `npm install`. Génère le client Prisma (`generated/`). Sans ça, le build TS plante car `generated/` est dans le `.gitignore`. |
| `build`        | Compile TS → JS dans `dist/`.                                                     |
| `start`        | `prisma migrate deploy` applique les migrations en attente sur la prod, **puis** (`&&`) lance le serveur. Si la migration échoue, le serveur ne démarre pas. |
| `dev`          | Hot reload local via `tsx`. Pas de migration ici (en local on utilise `migrate dev`). |

### Différence `migrate dev` vs `migrate deploy`

| Commande              | Quand                | Ce qu'elle fait                                                |
| --------------------- | -------------------- | -------------------------------------------------------------- |
| `prisma migrate dev`  | Local                | Lit `schema.prisma`, **crée** un nouveau fichier de migration, l'applique sur la BDD locale |
| `prisma migrate deploy` | Prod (CI/CD)        | Applique seulement les migrations existantes. Ne crée jamais de nouveau fichier. Ne touche pas au schema. |

---

## 3. `render.yaml` — Infrastructure as Code (IaC) pour Render

### Concept général
Décrire l'infrastructure (services, BDD, env vars) dans un fichier YAML versionné dans git, plutôt que de cliquer dans le dashboard. Avantages :
- Reproductible
- Versioné (git log = historique des changements d'infra)
- Pas de secret dans le fichier (Render gère les valeurs sensibles)
- Documentation auto-mise à jour

### Mon `render.yaml` décodé

```yaml
services:
  - type: web                 # API HTTP exposée (vs worker, cron, pserv)
    name: lotofolio-api       # détermine l'URL : lotofolio-api.onrender.com
    runtime: node             # détecte la version dans package.json
    plan: free                # 750h/mois, s'endort après 15 min d'inactivité
    region: frankfurt         # latence faible depuis la France
    branch: main              # déclencheur de déploiement
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /health  # liveness check (le bon !)
    autoDeploy: true          # push main → deploy auto

    envVars:
      - key: NODE_ENV
        value: production

      - key: JWT_SECRET
        generateValue: true   # Render crée un secret aléatoire sûr
                              # → je ne vois jamais cette valeur

      - key: DATABASE_URL
        fromDatabase:         # liaison auto avec la BDD ci-dessous
          name: lotofolio-db
          property: connectionString

      - key: FRONTEND_URL
        sync: false           # à renseigner manuellement dans le dashboard
                              # (URL du frontend pas encore connue)

databases:
  - name: lotofolio-db        # référencé dans fromDatabase plus haut
    plan: free                # 1 GB, expire après 90 jours sur free tier
    databaseName: loto_api    # nom de la base SQL elle-même
    user: loto_admin
    region: frankfurt         # MÊME région que le service web (latence)
    postgresMajorVersion: "16"
```

### Les patterns utiles à retenir

| Pattern                    | Quand l'utiliser                                                  |
| -------------------------- | ----------------------------------------------------------------- |
| `generateValue: true`      | Pour un secret que Render doit créer (JWT, clés API internes)     |
| `fromDatabase`             | Pour injecter une connection string sans la coder en dur          |
| `fromService`              | Pour qu'un service récupère l'URL d'un autre service du blueprint |
| `sync: false`              | Pour une valeur que je remplis manuellement plus tard             |
| `value: ...`               | Pour les valeurs publiques non sensibles (NODE_ENV, PORT)         |

---

## 4. Concepts plus larges (pour les entretiens)

### Infrastructure as Code (IaC)
**Définition :** Décrire l'infrastructure (serveurs, BDD, réseaux) dans des fichiers texte versionnés, exécutés par un outil.

**Outils, du plus simple au plus complexe :**
- `docker-compose.yml` → multi-conteneurs locaux
- `render.yaml`, `fly.toml` → IaC d'une PaaS spécifique
- **Terraform** → standard multi-cloud (AWS, GCP, Azure, …)
- **Pulumi** → comme Terraform mais en TypeScript / Python
- **Ansible** → configuration de serveurs existants

### Orchestration de conteneurs : Kubernetes (k8s)
**Concept :** orchestrer des centaines de conteneurs Docker sur une ferme de serveurs. Tu lui dis quoi tu veux (3 instances de mon API, 512 Mo de RAM chacune), il fait le reste (lancement, monitoring, restart, load balancing, rolling updates).

**Hiérarchie des plateformes :**
```
Kubernetes (k8s)              ← grandes boîtes, équipes Ops dédiées
   ↓ abstrait par
PaaS (Render, Heroku, Fly)    ← startups, projets perso (utilisent k8s en interne)
   ↓ tourne sur
Conteneurs Docker             ← standard universel
```

**Render utilise Kubernetes en coulisses.** Mon `render.yaml` est traduit en config k8s que je ne vois jamais.

### Niveau attendu en entretien junior/mid
- Comprendre le concept d'IaC
- Savoir lire un YAML k8s
- Avoir déployé un truc sur une PaaS
→ ce que je sais faire ✅

### Vocabulaire à maîtriser
- **Déclaratif vs impératif** : *"je décris l'état final"* vs *"je décris les étapes"*
- **Conteneur (Docker)** : isolation processus + filesystem
- **Orchestration** : gérer un ensemble de conteneurs à grande échelle
- **PaaS** : Platform as a Service (Render, Heroku) — abstrait l'infra
- **IaaS** : Infrastructure as a Service (AWS EC2) — VM brute, je gère tout
- **CI/CD** : intégration et déploiement continus
- **Rolling update** : mise à jour progressive sans coupure (kill une instance, lance la nouvelle, kill la suivante…)
- **Liveness probe** : vérifie que le process tourne
- **Readiness probe** : vérifie que l'instance peut servir du trafic

---

## 5. Checklist de déploiement portfolio

- [x] `package.json` avec `postinstall: prisma generate`
- [x] `start` avec `prisma migrate deploy &&` avant le serveur
- [x] `/health` léger (sans BDD)
- [x] `/ready` qui check la BDD (HTTP 503 si KO)
- [x] `render.yaml` avec service web + BDD liés
- [x] `.env.example` commité (clés sans valeurs)
- [x] `.gitignore` complet (`.env`, `dist/`, `generated/`, `.DS_Store`, etc.)
- [x] README avec stack, archi, sécurité, justifications techniques
- [ ] Premier déploiement Render testé
- [ ] Ajouter un `Dockerfile` (étape suivante vers k8s)
- [ ] Tests d'intégration (Vitest + Supertest)
- [ ] CI GitHub Actions (lint + tests + audit)
