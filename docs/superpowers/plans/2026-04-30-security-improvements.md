# Security Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the loto-backend Express API with env validation, input validation, rate limiting, helmet, and dynamic CORS.

**Architecture:** Centralized env validation in `src/config/env.ts` (fail-fast on boot), rate limiters in `src/middleware/rateLimit.ts`, zod body schemas inline in `auth.routes.ts`, helmet + dynamic CORS in `server.ts`.

**Tech Stack:** zod, helmet, express-rate-limit (existing: Express 5, TypeScript, Prisma, jsonwebtoken, bcrypt)

> **Note:** No test framework is configured. Verification steps use `npm run build` (TypeScript check) + manual curl commands.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/config/env.ts` | CREATE | Zod schema for all env vars, process.exit(1) on failure, exports typed `env` object |
| `src/middleware/rateLimit.ts` | CREATE | `loginLimiter` (5/15min) and `registerLimiter` (3/1h) |
| `src/middleware/auth.ts` | MODIFY | Replace `process.env.JWT_SECRET as string` with `env.JWT_SECRET` |
| `src/routes/auth.routes.ts` | MODIFY | Add zod schemas + validation, apply rate limiters, use `env` |
| `src/server.ts` | MODIFY | Add helmet, replace hardcoded CORS with dynamic `env.FRONTEND_URL`, import `env` first |

---

### Task 1: Install dependencies + update .env

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env`

- [ ] **Step 1: Install the three new packages**

```bash
npm install zod helmet express-rate-limit
```

Expected output: 3 packages added, no errors.

- [ ] **Step 2: Verify JWT_SECRET length in .env**

Open `.env` and check that `JWT_SECRET` is at least 32 characters. If it's shorter, replace it with a new value. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 3: Add FRONTEND_URL to .env**

Add this line to `.env`:

```
FRONTEND_URL=http://localhost:4200
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "chore: install zod, helmet, express-rate-limit; add FRONTEND_URL to env"
```

---

### Task 2: Create `src/config/env.ts`

**Files:**
- Create: `src/config/env.ts`

- [ ] **Step 1: Create the file**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Variables d\'environnement invalides :');
  result.error.issues.forEach(issue => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = result.data;
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: no TypeScript errors. If `DATABASE_URL` or another var is missing from `.env`, the server will exit — but the build itself should pass.

- [ ] **Step 3: Commit**

```bash
git add src/config/env.ts
git commit -m "feat: add env validation with zod (fail-fast on boot)"
```

---

### Task 3: Create `src/middleware/rateLimit.ts`

**Files:**
- Create: `src/middleware/rateLimit.ts`

- [ ] **Step 1: Create the file**

```typescript
import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives de connexion, réessaie dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Trop de tentatives d\'inscription, réessaie dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/rateLimit.ts
git commit -m "feat: add rate limiting middleware (login 5/15min, register 3/1h)"
```

---

### Task 4: Update `src/middleware/auth.ts`

**Files:**
- Modify: `src/middleware/auth.ts`

- [ ] **Step 1: Add env import and replace process.env usage**

Replace the entire file content with:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

interface JwtPayload {
  userId: number;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token manquant ou format invalide' });
      return;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.userId = decoded.userId;

    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/auth.ts
git commit -m "refactor: use env.JWT_SECRET in auth middleware"
```

---

### Task 5: Update `src/routes/auth.routes.ts`

**Files:**
- Modify: `src/routes/auth.routes.ts`

- [ ] **Step 1: Replace the entire file with the validated version**

```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { excludePassword } from '../utils/user.utils.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { env } from '../config/env.js';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court (8 caractères minimum)'),
  username: z.string().min(2, 'Nom d\'utilisateur trop court').max(30, 'Nom d\'utilisateur trop long'),
});

const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

// INSCRIPTION
router.post('/register', registerLimiter, async (req, res) => {
  const result = RegisterSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message })),
    });
  }

  const { email, password, username } = result.data;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, username },
    });

    const token = jwt.sign(
      { userId: user.id },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: excludePassword(user),
      token,
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// CONNEXION
router.post('/login', loginLimiter, async (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Données invalides',
      details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message })),
    });
  }

  const { email, password } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { userId: user.id },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Connexion réussie',
      user: { id: user.id, email: user.email, name: user.username },
      token,
    });
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// PROFIL (protégé)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, username: true, createdAt: true, updatedAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Erreur profil:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

export default router;
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth.routes.ts
git commit -m "feat: add zod input validation and rate limiting to auth routes"
```

---

### Task 6: Update `src/server.ts`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Replace the entire file with the secured version**

```typescript
import { env } from './config/env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.routes.js';
import jeuRoutes from './routes/jeu.route.js';

const app = express();

console.log('🔧 Initializing server...');

const allowedOrigins = env.FRONTEND_URL.split(',').map(s => s.trim());

// ✅ 1. Security headers
app.use(helmet());

// ✅ 2. CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ✅ 3. JSON Parser
app.use(express.json());

// ✅ 4. Logger (AVANT les routes !)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📨 ${req.method} ${req.url}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  next();
});

// ✅ 5. Routes
console.log('🔧 Registering /api/auth routes...');
app.use('/api/auth', authRoutes);
app.use('/api/jeux', jeuRoutes);

// ✅ 6. Routes de test
app.get('/', (req: Request, res: Response) => {
  res.json({ message: '✅ API Loto is running' });
});

app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR' });
  }
});

// ✅ 7. 404
app.use((req: Request, res: Response) => {
  console.log(`❌ 404 - ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(env.PORT, async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Server: http://localhost:${env.PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Base de données connectée avec succès');
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERREUR : Impossible de se connecter à la base de données !');
    console.error('👉 Vérifie que MariaDB est bien lancé avant de démarrer le serveur.');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
});
```

Note: `import { env } from './config/env.js'` is intentionally the **first** import — this ensures env validation runs before anything else initializes.

Note: The unused `authMiddleware` import was removed from `server.ts` (it was imported but never used there — it's used in `auth.routes.ts`).

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add helmet, dynamic CORS from env, use env.PORT"
```

---

### Task 7: End-to-end verification

**Files:** none modified

- [ ] **Step 1: Start the server**

```bash
npm run dev
```

Expected: server starts, prints `✅ Base de données connectée avec succès`, no crash.

- [ ] **Step 2: Test input validation — body vide sur /register**

```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

Expected:
```json
{
  "error": "Données invalides",
  "details": [
    { "field": "email", "message": "Email invalide" },
    { "field": "password", "message": "Mot de passe trop court (8 caractères minimum)" },
    { "field": "username", "message": "Nom d'utilisateur trop court" }
  ]
}
```

- [ ] **Step 3: Test input validation — email invalide sur /login**

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "pasunemail", "password": "test"}' | jq
```

Expected:
```json
{
  "error": "Données invalides",
  "details": [{ "field": "email", "message": "Email invalide" }]
}
```

- [ ] **Step 4: Test rate limiting — 6 appels rapides sur /login**

```bash
for i in {1..6}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@test.com", "password": "wrongpassword"}';
done
```

Expected: requêtes 1-5 retournent `401`, requête 6 retourne `429`.

- [ ] **Step 5: Test que les headers helmet sont présents**

```bash
curl -sI http://localhost:3000/ | grep -E "X-Frame-Options|X-Content-Type|Strict-Transport"
```

Expected: au moins une ligne de header de sécurité affiché.

- [ ] **Step 6: Test fail-fast — commenter JWT_SECRET dans .env et relancer**

Mettre `# JWT_SECRET=...` dans `.env` (commenter la ligne), puis `npm run dev`.

Expected: le serveur affiche l'erreur zod et s'arrête sans démarrer :
```
❌ Variables d'environnement invalides :
  - JWT_SECRET : String must contain at least 32 character(s)
```

Décommenter `JWT_SECRET` dans `.env` avant de continuer.

- [ ] **Step 7: Commit final**

```bash
git add docs/superpowers/plans/2026-04-30-security-improvements.md
git commit -m "docs: add security improvements implementation plan"
```
