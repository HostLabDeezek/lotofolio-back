# 🎯 CONTEXT : Backend Loto avec Node.js + Prisma + MySQL

Je suis développeur frontend qui doit créer une interface pour un backend de gestion de loto déjà développé.

## 📊 BASE DE DONNÉES (MySQL avec Prisma)

### Schema Prisma complet :

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @db.VarChar(255)
  username  String   @db.VarChar(100)
  password  String   @db.VarChar(255)
  role      Role     @default(USER)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  grilles Grille[]
  parties Partie[]

  @@map("users")
}

model Jeu {
  id          Int      @id @default(autoincrement())
  nom         String   @db.VarChar(100)
  description String?  @db.Text
  regle       String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")

  grilles Grille[]
  tirages Tirage[]

  @@map("jeux")
}

model Grille {
  id           Int      @id @default(autoincrement())
  userId       Int      @map("user_id")
  jeuId        Int      @map("jeu_id")
  numeros      String   @db.VarChar(255)
  numeroChance String   @map("numero_chance") @db.VarChar(255)
  createdAt    DateTime @default(now()) @map("created_at")

  user    User     @relation(fields: [userId], references: [id])
  jeu     Jeu      @relation(fields: [jeuId], references: [id])
  parties Partie[]

  @@map("grilles")
}

model Tirage {
  id               Int      @id @default(autoincrement())
  jeuId            Int      @map("jeu_id")
  dateTirage       DateTime @map("date_tirage")
  numerosTires     String   @map("numeros_tires") @db.VarChar(255)
  numeroChanceTire String   @map("numero_chance_tire") @db.VarChar(255)
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

  @@unique([grilleId, tirageId])
  @@map("parties")
}

model Resultat {
  id            Int     @id @default(autoincrement())
  partieId      Int     @unique @map("partie_id")
  nbBonsNumeros Int     @map("nb_bons_numeros")
  bonNumeroChance Boolean @map("bon_numero_chance")
  rang          Int?
  gain          Decimal? @db.Decimal(10, 2)

  partie Partie @relation(fields: [partieId], references: [id])

  @@map("resultats")
}
🛣️ API ENDPOINTS DISPONIBLES
1. Authentification (/api/auth)
POST /api/auth/register
Créer un compte
// Request
{
  "email": "user@example.com",
  "username": "JohnDoe",
  "password": "Password123!"
}

// Response 201
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "JohnDoe",
    "role": "USER"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
POST /api/auth/login
Se connecter
// Request
{
  "email": "user@example.com",
  "password": "Password123!"
}

// Response 200
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "JohnDoe",
    "role": "USER"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
GET /api/auth/me
Profil utilisateur connecté
// Headers
Authorization: Bearer {token}

// Response 200
{
  "id": 1,
  "email": "user@example.com",
  "username": "JohnDoe",
  "role": "USER",
  "createdAt": "2024-01-15T10:30:00.000Z"
}

2. Jeux (/api/jeux)
GET /api/jeux
Liste des jeux disponibles
// Response 200
[
  {
    "id": 1,
    "nom": "Loto",
    "description": "Le jeu du Loto classique",
    "regle": "Choisir 5 numéros entre 1 et 49, et 1 numéro chance entre 1 et 10"
  }
]
GET /api/jeux/:id
Détails d'un jeu
// Response 200
{
  "id": 1,
  "nom": "Loto",
  "description": "Le jeu du Loto classique",
  "regle": "Choisir 5 numéros entre 1 et 49, et 1 numéro chance entre 1 et 10",
  "createdAt": "2024-01-01T00:00:00.000Z"
}

3. Grilles (/api/grilles)
⚠️ Toutes les routes nécessitent authentification
POST /api/grilles
Créer une grille
// Headers
Authorization: Bearer {token}

// Request
{
  "jeuId": 1,
  "numeros": "5,12,23,34,45",
  "numeroChance": "7"
}

// Response 201
{
  "id": 1,
  "userId": 1,
  "jeuId": 1,
  "numeros": "5,12,23,34,45",
  "numeroChance": "7",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
GET /api/grilles
Mes grilles
// Headers
Authorization: Bearer {token}

// Response 200
[
  {
    "id": 1,
    "numeros": "5,12,23,34,45",
    "numeroChance": "7",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "jeu": {
      "id": 1,
      "nom": "Loto"
    }
  }
]
GET /api/grilles/:id
Détails d'une grille
// Headers
Authorization: Bearer {token}

// Response 200
{
  "id": 1,
  "userId": 1,
  "jeuId": 1,
  "numeros": "5,12,23,34,45",
  "numeroChance": "7",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "jeu": {
    "id": 1,
    "nom": "Loto"
  }
}
DELETE /api/grilles/:id
Supprimer une grille
// Headers
Authorization: Bearer {token}

// Response 200
{
  "message": "Grille supprimée avec succès"
}

4. Tirages (/api/tirages)
GET /api/tirages
Derniers tirages
// Query params (optionnel)
?jeuId=1&limit=10

// Response 200
[
  {
    "id": 1,
    "jeuId": 1,
    "dateTirage": "2024-01-15T20:00:00.000Z",
    "numerosTires": "3,15,27,38,42",
    "numeroChanceTire": "9",
    "jeu": {
      "id": 1,
      "nom": "Loto"
    }
  }
]
GET /api/tirages/:id
Détails d'un tirage
// Response 200
{
  "id": 1,
  "jeuId": 1,
  "dateTirage": "2024-01-15T20:00:00.000Z",
  "numerosTires": "3,15,27,38,42",
  "numeroChanceTire": "9",
  "createdAt": "2024-01-15T20:00:00.000Z",
  "jeu": {
    "id": 1,
    "nom": "Loto"
  }
}

5. Parties (/api/parties)
⚠️ Toutes les routes nécessitent authentification
POST /api/parties
Jouer une grille sur un tirage
// Headers
Authorization: Bearer {token}

// Request
{
  "grilleId": 1,
  "tirageId": 1
}

// Response 201
{
  "id": 1,
  "userId": 1,
  "grilleId": 1,
  "tirageId": 1,
  "createdAt": "2024-01-15T20:05:00.000Z",
  "grille": {
    "id": 1,
    "numeros": "5,12,23,34,45",
    "numeroChance": "7"
  },
  "tirage": {
    "id": 1,
    "numerosTires": "3,15,27,38,42",
    "numeroChanceTire": "9"
  }
}
GET /api/parties
Mes parties
// Headers
Authorization: Bearer {token}

// Response 200
[
  {
    "id": 1,
    "createdAt": "2024-01-15T20:05:00.000Z",
    "grille": {
      "numeros": "5,12,23,34,45",
      "numeroChance": "7"
    },
    "tirage": {
      "dateTirage": "2024-01-15T20:00:00.000Z",
      "numerosTires": "3,15,27,38,42",
      "numeroChanceTire": "9"
    },
    "resultat": {
      "nbBonsNumeros": 2,
      "bonNumeroChance": false,
      "rang": null,
      "gain": null
    }
  }
]
GET /api/parties/:id
Détails d'une partie
// Headers
Authorization: Bearer {token}

// Response 200
{
  "id": 1,
  "userId": 1,
  "grilleId": 1,
  "tirageId": 1,
  "createdAt": "2024-01-15T20:05:00.000Z",
  "grille": {...},
  "tirage": {...},
  "resultat": {...}
}
GET /api/parties/:id/resultat
Résultat d'une partie
// Headers
Authorization: Bearer {token}

// Response 200
{
  "id": 1,
  "partieId": 1,
  "nbBonsNumeros": 3,
  "bonNumeroChance": true,
  "rang": 5,
  "gain": "15.00"
}

6. Résultats (/api/resultats)
⚠️ Toutes les routes nécessitent authentification
GET /api/resultats/mes-gains
Historique de mes gains
// Headers
Authorization: Bearer {token}

// Response 200
{
  "totalGains": "150.50",
  "nombreParties": 25,
  "nombreVictoires": 3,
  "historique": [
    {
      "partieId": 1,
      "dateTirage": "2024-01-15T20:00:00.000Z",
      "nbBonsNumeros": 5,
      "bonNumeroChance": true,
      "rang": 1,
      "gain": "100.00"
    }
  ]
}
GET /api/resultats/stats
Statistiques
// Headers
Authorization: Bearer {token}

// Response 200
{
  "totalParties": 25,
  "tauxReussite": "12.00",
  "moyenneBonsNumeros": 1.8,
  "numerosPlusJoues": [5, 12, 23, 34, 45],
  "numerosPlusSortis": [3, 15, 27, 38, 42]
}

🔐 AUTHENTIFICATION
Format du token JWT
// Headers à inclure dans chaque requête authentifiée
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

// Payload du token
{
  "id": 1,           // User ID
  "email": "user@example.com",
  "role": "USER",
  "iat": 1705334400,
  "exp": 1705420800  // Expire après 24h
}
Stockage recommandé
// localStorage pour le token
localStorage.setItem('token', token);

// Récupération
const token = localStorage.getItem('token');

⚠️ GESTION DES ERREURS
Codes HTTP utilisés
200 OK                  - Succès
201 Created             - Ressource créée
400 Bad Request         - Données invalides
401 Unauthorized        - Non authentifié / Token invalide
403 Forbidden           - Non autorisé (role insuffisant)
404 Not Found           - Ressource non trouvée
409 Conflict            - Grille déjà jouée sur ce tirage
500 Internal Server Error - Erreur serveur
Format des erreurs
{
  "error": "Message d'erreur en français"
}

📝 RÈGLES MÉTIER IMPORTANTES
Grilles

Numéros : 5 numéros entre 1 et 49, séparés par des virgules
Numéro Chance : 1 numéro entre 1 et 10
Format stocké : "5,12,23,34,45" et "7"

Parties

❌ Impossible de jouer 2 fois la même grille sur le même tirage
✅ Le résultat est calculé automatiquement après création
❌ Impossible de modifier ou supprimer une partie jouée

Résultats (calcul automatique)
// Rangs du Loto
Rang 1: 5 numéros + numéro chance
Rang 2: 5 numéros
Rang 3: 4 numéros + numéro chance
Rang 4: 4 numéros
Rang 5: 3 numéros + numéro chance
Rang 6: 3 numéros
Rang 7: 2 numéros + numéro chance
Autres: Pas de gain

🛠️ CONFIGURATION BACKEND
Variables d'environnement (.env)
DATABASE_URL="mysql://user:password@localhost:3306/loto_db"
JWT_SECRET="votre_secret_jwt_super_securise"
PORT=3000
NODE_ENV=development
URL de base de l'API
http://localhost:3000/api

📦 STACK TECHNIQUE BACKEND

Runtime : Node.js v20+
Framework : Express.js
ORM : Prisma 7
Base de données : MySQL 8
Authentification : JWT (jsonwebtoken)
Validation : express-validator
Sécurité : bcrypt, helmet, cors


🎯 POINTS IMPORTANTS POUR LE FRONTEND

Tous les IDs sont des nombres (pas de UUID)
Les dates sont en format ISO 8601 (2024-01-15T20:00:00.000Z)
Les numéros sont stockés en string ("5,12,23,34,45")
Le token JWT expire après 24h
Pas de pagination implémentée (toutes les listes complètes)
CORS activé pour localhost:5173 (Vite)


🚀 PAGES FRONTEND À CRÉER
Pages publiques

/login - Connexion
/register - Inscription

Pages authentifiées

/dashboard - Tableau de bord (mes parties récentes)
/grilles - Mes grilles + créer une grille
/tirages - Liste des tirages disponibles
/jouer - Jouer une grille sur un tirage
/resultats - Mes résultats et gains
/profil - Mon profil