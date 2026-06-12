# Mémo back → front — LF-31 : enregistrement des parties

> À l'attention du Claude front. Tout ce dont tu as besoin pour implémenter la soumission
> des grilles (`POST /api/parties`) est ici. Le back est **livré et déployé** (LF-34).
> Contenu vérifié dans le code source au 2026-06-08.

---

## 1. L'endpoint à appeler

```
POST /api/parties
Authorization: Bearer <jwt>        # OBLIGATOIRE (authMiddleware)
Content-Type: application/json
```

### Body

```jsonc
{
  "tirageId": 42,                  // number, entier positif, OBLIGATOIRE
  "grilles": [                     // tableau, AU MOINS 1 élément
    { "numeros": [3, 12, 24, 31, 49], "numeroChance": [7] },
    { "numeros": [1,  9, 18, 22, 40], "numeroChance": [2] }
  ]
}
```

- `tirageId` = l'`id` du tirage en cours, récupéré via l'endpoint « tirage du jour » (voir §3). **Ne pas le déduire du `jeuId`.**
- `numeros` et `numeroChance` sont des tableaux d'entiers positifs. Leur **longueur exacte** dépend du jeu (voir §4).
- L'ordre des numéros n'a pas d'importance (le back trie pour comparer).

### Réponse succès

```
201 Created
<corps vide>                       # ⚠️ AUCUN body — ne rien parser
```

→ Côté front : toast de succès, **on reste sur la page**, on réinitialise à **une seule grille vide**.

---

## 2. ⚠️ Les formats d'erreur ne sont PAS homogènes

Le back renvoie **trois formes de body d'erreur différentes**. Ton mapping doit gérer les trois, sinon tu vas lire `error.message` sur un objet qui n'en a pas.

| Cas | HTTP | Forme du body |
|---|---|---|
| Erreur métier (AppError) | 400 / 404 / 409 | `{ "code": "...", "message": "..." }` |
| Payload invalide (Zod) | 400 | `{ "code": "INVALID_PAYLOAD", "details": [{ "field", "message" }] }` — **pas de champ `message` à la racine** |
| Erreur serveur | 500 | `{ "error": "Erreur serveur interne" }` — **ni `code` ni `message`** |
| Auth KO | 401 | `{ "error": "Token manquant ou format invalide" }` / `{ "error": "Token invalide ou expiré" }` |

### Codes métier renvoyés par `POST /api/parties`

| HTTP | `code` | Quand | Message front suggéré |
|---|---|---|---|
| 400 | `INVALID_PAYLOAD` | JSON mal formé / types invalides (Zod). Ne devrait pas arriver si le front valide. | « Données invalides, vérifiez vos grilles. » |
| 400 | `INVALID_GRILLE` | Une grille casse les règles du jeu **ou** deux grilles strictement identiques dans la même soumission | « Une de vos grilles est invalide (ou deux grilles sont identiques). » |
| 404 | `TIRAGE_NOT_FOUND` | Le `tirageId` n'existe plus en base | « Le tirage n'est plus disponible, rechargez la page. » |
| 409 | `CUTOFF_PASSED` | Tirage plus `PENDING` **ou** à moins de 6 min de l'heure du tirage | « La saisie est fermée pour ce tirage. » |
| 500 | *(aucun, lire `error`)* | Bug serveur | « Une erreur est survenue, réessayez plus tard. » |

> ⚠️ Pas de `NO_CURRENT_TIRAGE` ni de `TOO_MANY_GRILLES` sur ce POST. Le back **ne plafonne pas** le nombre de grilles (le cap à 5 est une règle purement front, par composition).

En cas d'erreur : **ne pas réinitialiser la page** (l'utilisateur garde ses grilles pour corriger), afficher le message en haut de page.

---

## 3. Récupérer le `tirageId` (tirage en cours)

```
GET /api/jeux/:jeuId/current-tirage
Authorization: Bearer <jwt>
```

### Réponse 200 — l'objet Tirage

```jsonc
{
  "id": 42,
  "jeuId": 1,
  "dateTirage": "2026-06-08T18:00:00.000Z",  // ISO UTC = 20h00 Europe/Paris
  "numerosTires": [],                          // vide tant que pas tiré
  "numeroChanceTire": [],
  "status": "PENDING",
  "createdAt": "2026-06-07T18:05:00.000Z"
}
```

- `tirageId` pour le POST = ce `id`.
- `dateTirage` est en **UTC**. C'est ta source de vérité pour le compte à rebours et le cutoff — convertis-la en `Europe/Paris` pour l'affichage (`Intl.DateTimeFormat`, jamais `getHours()` brut).

### Réponse 404

```jsonc
{ "code": "NO_CURRENT_TIRAGE", "message": "Aucun tirage en cours pour ce jeu" }
```

> ⚠️ **Important pour le cutoff.** Cet endpoint ne renvoie **que** les tirages encore jouables : `status = PENDING` **et** `dateTirage > now + 6 min`. Donc dès que le cutoff (19h54) est franchi, cet endpoint renvoie **404** pour le tirage du soir, jusqu'à ce que le tirage du lendemain soit créé. Ne le rappelle pas en boucle entre 19h54 et la création du tirage suivant : appuie-toi sur le blocage local décrit dans le ticket.

---

## 4. Règles de validation (à recopier côté front pour pré-valider)

Le back valide chaque grille contre les caractéristiques du **jeu**. Récupère ces valeurs depuis `GET /api/jeux` (champs du modèle `Jeu`) :

| Champ jeu | Rôle |
|---|---|
| `nbNumerosATirer` | nombre de numéros attendus dans `numeros` (longueur exacte) |
| `intervalNumero` | borne max des numéros (plage `1..intervalNumero`) |
| `nbNumeroChanceATirer` | nombre de numéros chance attendus dans `numeroChance` |
| `intervalNumeroChance` | borne max des numéros chance (plage `1..intervalNumeroChance`) |

Règles appliquées par le back (premier échec → `400 INVALID_GRILLE`) :

1. `numeros.length === jeu.nbNumerosATirer` **et** `numeroChance.length === jeu.nbNumeroChanceATirer`.
2. Tous les numéros dans `1..intervalNumero`, tous les chances dans `1..intervalNumeroChance`.
3. Pas de doublon **à l'intérieur** d'une grille (ni dans `numeros`, ni dans `numeroChance`).
4. Pas **deux grilles identiques** dans la même soumission (comparaison après tri, indépendante de l'ordre).

Reproduis 1→4 côté front pour désactiver « Valider » et éviter l'aller-retour réseau. Le back reste la source de vérité.

---

## 5. Comportement upsert — à bien comprendre

Le back fait un **upsert idempotent sur `(userId, tirageId)`** :

- Première soumission pour un tirage → crée la `Partie` + ses `Grille`.
- Soumissions suivantes pour le **même** tirage → **ajoute** les nouvelles grilles à la `Partie` existante.

Conséquences pour le front :
- C'est ce qui permet d'enregistrer **plus de 5 grilles au total** : on soumet par lots de ≤ 5, la page se réinitialise, on recommence.
- ⚠️ **La déduplication n'a lieu qu'à l'intérieur d'une soumission**, pas entre deux soumissions. Si l'utilisateur resoumet une grille déjà envoyée dans un lot précédent, elle sera **stockée en double**. Le back ne s'en plaint pas. Si tu veux l'éviter, c'est au front de le gérer (non demandé par le ticket).

---

## 6. Le cutoff « 19h54 » — d'où il sort

- La marge de cutoff back est **configurable** : `CUTOFF_MARGIN_MINUTES`, **défaut = 6 min**.
- Tirage à 20h00 Paris − 6 min ⇒ **19h54**. Le « 19h54 » du ticket suppose donc cette marge de 6 min.
- Recommandation : plutôt que de coder « 19h54 » en dur, calcule `cutoff = dateTirage − 6 min` à partir du `dateTirage` du tirage en cours. Si la marge change côté back, ton front suit tout seul.
- Règle exacte du back qui déclenche `409 CUTOFF_PASSED` : `status !== PENDING` **OU** `dateTirage <= now + 6 min`.

---

## 7. Récap des endpoints

| Méthode | URL | Auth | Usage |
|---|---|---|---|
| `GET` | `/api/jeux` | Bearer | liste des jeux + leurs règles (§4) |
| `GET` | `/api/jeux/:jeuId/current-tirage` | Bearer | tirage en cours → `tirageId` + `dateTirage` (§3) |
| `POST` | `/api/parties` | Bearer | enregistrer les grilles (§1) |

Toutes les routes exigent l'en-tête `Authorization: Bearer <jwt>`. Sans token valide → `401 { "error": "..." }`.
