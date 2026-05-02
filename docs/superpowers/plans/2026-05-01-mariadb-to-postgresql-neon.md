# Migration MariaDB → PostgreSQL (Neon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer la base de données de MariaDB (local) vers PostgreSQL hébergé sur Neon, en supprimant l'adapter MariaDB et en régénérant les migrations.

**Architecture:** Prisma 7 avec `provider = "postgresql"` + `@prisma/adapter-neon`. Le nouveau générateur `prisma-client` de Prisma 7 exige un driver adapter (adapter ou accelerateUrl obligatoire dans le constructeur). On remplace `@prisma/adapter-mariadb` par `@prisma/adapter-neon` + `@neondatabase/serverless`. La `DATABASE_URL` Neon remplace les 4 variables `DB_*` individuelles.

**Tech Stack:** Prisma 7, PostgreSQL (Neon), Node.js + Express 5, TypeScript ES Modules

---

## Pourquoi ces changements ?

| Ce qui change | Pourquoi |
|---|---|
| `provider = "mysql"` → `"postgresql"` | Prisma génère du SQL différent selon le provider (types, séquences, syntaxe d'index) |
| Suppression `@prisma/adapter-mariadb` | L'adapter MariaDB est un driver Prisma alternatif spécifique à MySQL/MariaDB. PostgreSQL n'en a pas besoin — `PrismaClient()` standard se connecte via `DATABASE_URL` |
| `new PrismaClient()` sans adapter | Neon est accessible en TCP standard. L'adapter `@prisma/adapter-neon` (WebSocket) n'est utile que sur Vercel Edge / Cloudflare Workers où TCP est interdit |
| Suppression `DB_HOST/DB_USER/etc.` | Ces vars n'étaient utilisées que par l'adapter MariaDB. Neon fournit une seule `DATABASE_URL` complète (`postgresql://user:pass@host/db?sslmode=require`) |
| Suppression des 6 migrations MySQL | Les migrations contiennent du SQL MySQL-spécifique (`ENUM`, `AUTO_INCREMENT`, backticks, `CHARACTER SET utf8mb4`). Incompatibles PostgreSQL. On repart d'une migration propre |
| Suppression `@db.VarChar()` / `@db.Text` | Ces annotations `@db.*` sont des hints MySQL. En PostgreSQL, `String` = `text` par défaut, aussi performant que `varchar`. Les retirer simplifie le schéma sans perte |

---

## Task 1 : Mettre à jour `prisma/schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma`

**Explication:** On change le `provider` et on retire les annotations `@db.*` qui sont des hints spécifiques MySQL.

- [ ] **Step 1.1 : Changer le provider**

Remplacer dans `prisma/schema.prisma` (lignes 12-14) :

```prisma
datasource db {
  provider = "mysql"
}
```

par :

```prisma
datasource db {
  provider = "postgresql"
}
```

> La `url` n'est pas définie ici car elle est lue depuis `prisma.config.ts` via `process.env["DATABASE_URL"]`. Rien à changer dans `prisma.config.ts`.

- [ ] **Step 1.2 : Retirer les annotations `@db.*` de chaque modèle**

Résultat final du schéma (remplacer tout le contenu après le commentaire `// ===...===`) :

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  username  String
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  parties Partie[]

  @@map("users")
}

model Jeu {
  id              Int      @id @default(autoincrement())
  nom             String
  description     String?
  regle           String?
  nbNumeros       Int      @map("nb_numeros")
  maxNumero       Int      @map("max_numeros")
  nbNumeroNhance  Int      @map("nb_numero_chance")
  maxNumeroChance Int      @map("max_numero_chance")
  updatedAt       DateTime @updatedAt @map("updated_at")
  createdAt       DateTime @default(now()) @map("created_at")

  tirages Tirage[]

  @@map("jeux")
}

model Grille {
  id           Int      @id @default(autoincrement())
  jeuId        Int      @map("jeu_id")
  numeros      String
  numeroChance String   @map("numero_chance")
  createdAt    DateTime @default(now()) @map("created_at")

  parties Partie[]

  @@map("grilles")
}

model Tirage {
  id               Int      @id @default(autoincrement())
  jeuId            Int      @map("jeu_id")
  dateTirage       DateTime @map("date_tirage")
  numerosTires     String?  @map("numeros_tires")
  numeroChanceTire String?  @map("numero_chance_tire")
  createdAt        DateTime @default(now()) @map("created_at")

  jeu     Jeu      @relation(fields: [jeuId], references: [id])
  parties Partie[]

  @@map("tirages")
}

model Partie {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  grilleId  Int      @map("grille_id")
  tirageId  Int      @map("tirage_id")
  createdAt DateTime @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id])
  grille   Grille    @relation(fields: [grilleId], references: [id])
  tirage   Tirage    @relation(fields: [tirageId], references: [id])
  resultat Resultat?

  @@map("parties")
}

model Resultat {
  id            Int      @id @default(autoincrement())
  partieId      Int      @unique @map("partie_id")
  nbBonsNumeros Int      @map("nb_bons_numeros")
  nbBonsChance  Int      @map("nb_bons_chance")
  rang          Int?
  gain          String   @default("")
  isGagnant     Boolean  @default(false) @map("is_gagnant")
  createdAt     DateTime @default(now()) @map("created_at")

  partie Partie @relation(fields: [partieId], references: [id])

  @@map("resultats")
}

enum Role {
  USER
  ADMIN
}
```

---

## Task 2 : Mettre à jour `src/lib/prisma.ts`

**Files:**
- Modify: `src/lib/prisma.ts`

**Explication:** L'adapter MariaDB (`PrismaMariaDb`) lisait `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`. En PostgreSQL standard, Prisma lit directement `DATABASE_URL`. On supprime l'adapter et les variables individuelles.

- [ ] **Step 2.1 : Remplacer le contenu de `src/lib/prisma.ts`**

```typescript
import "dotenv/config";
import { PrismaClient } from '../../generated/prisma/client.js';

const prisma = new PrismaClient();

const disconnect = async () => {
  await prisma.$disconnect();
  console.log('Prisma disconnected');
};

process.on('beforeExit', disconnect);
process.on('SIGINT', disconnect);
process.on('SIGTERM', disconnect);

export { prisma }
```

> `PrismaClient()` sans argument lit automatiquement `DATABASE_URL` depuis l'environnement. Pas d'adapter nécessaire pour Neon en TCP.

---

## Task 3 : Mettre à jour `package.json` et désinstaller l'adapter

**Files:**
- Modify: `package.json`

**Explication:** `@prisma/adapter-mariadb` n'est plus utilisé. Le supprimer évite une dépendance inutile et des warnings.

- [ ] **Step 3.1 : Désinstaller le paquet**

```bash
npm uninstall @prisma/adapter-mariadb
```

Résultat attendu : `removed 1 package` (ou similaire), `package.json` ne contient plus `@prisma/adapter-mariadb` dans les `dependencies`.

---

## Task 4 : Mettre à jour `.env`

**Files:**
- Modify: `.env`

**Explication:** Remplacer les 4 variables MariaDB par la `DATABASE_URL` Neon. La variable `DATABASE_URL` existait déjà mais pointait vers MySQL local.

- [ ] **Step 4.1 : Remplacer le contenu de `.env`**

```dotenv
DATABASE_URL="postgresql://[user]:[password]@[host]/[dbname]?sslmode=require"
JWT_SECRET="a4f8d9e2b7c3f1a6e8d5c9b2a7f3e1d8c6b4a9f2e7d3c8b5a1f6e9d2c7b4a8f3"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV="development"
FRONTEND_URL=http://localhost:4200
```

> Remplacer `[user]:[password]@[host]/[dbname]` par les vraies valeurs depuis le dashboard Neon (onglet "Connection string", format `postgresql://`). Ajouter `?sslmode=require` si Neon ne l'inclut pas déjà (il l'inclut généralement).
>
> Les variables `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` sont supprimées — aucun fichier TypeScript ne les référence plus.

---

## Task 5 : Supprimer les migrations MySQL et créer la migration PostgreSQL initiale

**Files:**
- Delete: `prisma/migrations/20260111230844_init/`
- Delete: `prisma/migrations/20260201224005_add_loto/`
- Delete: `prisma/migrations/20260202221911_remove_gain/`
- Delete: `prisma/migrations/20260202222304_change_camel_case/`
- Delete: `prisma/migrations/20260204224314_update_jeu/`
- Delete: `prisma/migrations/20260204225716_update_tirage/`
- Delete: `prisma/migrations/migration_lock.toml`
- Create: `prisma/migrations/` (nouveau contenu via `prisma migrate dev`)

**Explication:** Les migrations MySQL contiennent du SQL incompatible PostgreSQL (`AUTO_INCREMENT` vs `SERIAL`, backticks vs guillemets doubles, `ENUM` déclaré inline vs type séparé, `CHARACTER SET`). On doit les supprimer et laisser Prisma générer du SQL PostgreSQL propre.

- [ ] **Step 5.1 : Supprimer toutes les migrations existantes**

```bash
rm -rf prisma/migrations/
```

- [ ] **Step 5.2 : Régénérer le client Prisma pour le nouveau provider**

```bash
npx prisma generate
```

Résultat attendu : `Generated Prisma Client` sans erreurs.

- [ ] **Step 5.3 : Créer la migration initiale PostgreSQL**

S'assurer que `DATABASE_URL` dans `.env` pointe vers la base Neon (vide ou inexistante), puis :

```bash
npx prisma migrate dev --name init
```

Résultat attendu :
```
Applying migration `20260501000000_init`
Your database is now in sync with your schema.
Generated Prisma Client
```

> Si Neon renvoie une erreur SSL : vérifier que `?sslmode=require` est dans la `DATABASE_URL`.
> Si erreur `P1001` (connexion refusée) : vérifier les credentials Neon et que la base existe bien sur le dashboard.

- [ ] **Step 5.4 : Vérifier que le schéma est bien appliqué**

```bash
npx prisma studio
```

Ouvrir `http://localhost:5555` et vérifier que les tables `users`, `jeux`, `grilles`, `tirages`, `parties`, `resultats` sont présentes.

---

## Task 6 : Compiler et vérifier le serveur

**Files:**
- No file changes

- [ ] **Step 6.1 : Compiler TypeScript**

```bash
npm run build
```

Résultat attendu : pas d'erreurs TypeScript dans `src/lib/prisma.ts` ni ailleurs.

- [ ] **Step 6.2 : Démarrer le serveur et tester l'endpoint existant**

```bash
npm run dev
```

Dans un autre terminal :

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"password123"}'
```

Résultat attendu : `201 Created` avec un objet `user` (sans `password`) et un `token`.

```bash
curl http://localhost:3000/api/jeux \
  -H "Authorization: Bearer <token>"
```

Résultat attendu : `200 OK` avec un tableau (vide si base vide).

- [ ] **Step 6.3 : Commit**

```bash
git add prisma/schema.prisma src/lib/prisma.ts package.json package-lock.json prisma/migrations/
git commit -m "feat: migrate from MariaDB to PostgreSQL (Neon)"
```

> Ne pas commit `.env` — il contient les credentials Neon.
