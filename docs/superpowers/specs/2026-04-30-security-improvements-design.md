# Security Improvements Design

**Date:** 2026-04-30  
**Scope:** 5 security hardening items on the loto-backend Express API  
**Approach:** Option B — module `src/config/env.ts` + middleware séparés

---

## 1. Context

The current Express 5 / TypeScript / Prisma backend has the following security gaps:

- `process.env.JWT_SECRET!` used without boot-time validation — server starts even if the variable is missing
- No input validation on `POST /register` and `POST /login` — missing or malformed fields cause 500 errors
- No rate limiting — `/login` and `/register` are open to brute-force and account spam
- No security headers — no helmet, no CSP, HSTS, X-Frame-Options, etc.
- CORS origin hardcoded to `localhost:4200` — will not work in production

---

## 2. New File Structure

```
src/
├── config/
│   └── env.ts          ← NEW  — zod validation of all env vars, fail-fast on boot
├── middleware/
│   ├── auth.ts         ← UNCHANGED
│   └── rateLimit.ts    ← NEW  — loginLimiter + registerLimiter
├── routes/
│   └── auth.routes.ts  ← MODIFIED — zod body validation on register + login
└── server.ts           ← MODIFIED — helmet, dynamic CORS, import env config
```

---

## 3. Env Vars Validation (`src/config/env.ts`)

**Library:** `zod`

Validated variables:

| Variable | Constraint | Note |
|---|---|---|
| `DATABASE_URL` | `z.string().url()` | Must be a valid URL |
| `JWT_SECRET` | `z.string().min(32)` | Security: too short = brute-forceable |
| `JWT_EXPIRES_IN` | `z.string().default('7d')` | Optional, fallback `'7d'` |
| `PORT` | `z.coerce.number().default(3000)` | Optional, fallback `3000` |
| `FRONTEND_URL` | `z.string()` | CSV string, parsed in server.ts |

**On validation failure:** print a clear error listing each invalid field, then `process.exit(1)`. The server never reaches the Express bootstrap.

**Usage:** exported `env` object replaces all `process.env.JWT_SECRET!` and `process.env.JWT_SECRET as string` across the codebase.

**Error format:**
```
❌ Variables d'environnement invalides :
  - JWT_SECRET : String must contain at least 32 character(s)
  - DATABASE_URL : Invalid url
```

---

## 4. Input Validation (`src/routes/auth.routes.ts`)

**Library:** `zod` (same as env validation)

Schemas defined at the top of `auth.routes.ts`.

**RegisterSchema:**
- `email`: `z.string().email()`
- `password`: `z.string().min(8)`
- `username`: `z.string().min(2).max(30)`

**LoginSchema:**
- `email`: `z.string().email()`
- `password`: `z.string().min(1)`

**On validation failure:** `400` response with structured errors:
```json
{
  "error": "Données invalides",
  "details": [
    { "field": "email", "message": "Email invalide" },
    { "field": "password", "message": "String must contain at least 8 character(s)" }
  ]
}
```

---

## 5. Rate Limiting (`src/middleware/rateLimit.ts`)

**Library:** `express-rate-limit`

Two limiters exported from the same file:

| Limiter | Route | Window | Max attempts | Response |
|---|---|---|---|---|
| `loginLimiter` | `POST /login` | 15 min | 5 | `429` + French message |
| `registerLimiter` | `POST /register` | 1 hour | 3 | `429` + French message |

- Rate keyed by `req.ip`
- Standard `RateLimit-*` and `Retry-After` headers included automatically
- Applied **before** zod validation in each route handler

---

## 6. Helmet (`server.ts`)

```typescript
app.use(helmet())
```

Single line, added before all other middleware. Default configuration is sufficient for a REST API (activates ~15 security headers including CSP, HSTS, X-Frame-Options).

---

## 7. Dynamic CORS (`server.ts`)

`FRONTEND_URL` env var holds a comma-separated list of allowed origins:

```
# .env example
FRONTEND_URL=http://localhost:4200,https://preview.lotofolio.com,https://lotofolio.com
```

CORS config in `server.ts`:
- Parse `env.FRONTEND_URL.split(',').map(s => s.trim())` at startup
- Use the function form of `origin` to check each request origin against the list
- `!origin` (no origin header) is allowed — covers Postman, curl, server-to-server health checks
- Non-matching origins receive a CORS error

Existing `credentials`, `methods`, and `allowedHeaders` options are preserved.

---

## 8. Dependencies to Install

```bash
npm install zod helmet express-rate-limit
```

`express-rate-limit` v7+ ships its own TypeScript types — no `@types/` package needed.

---

## 9. Migration Notes

- `JWT_SECRET` minimum 32 characters: if the current value in `.env` is shorter, it must be regenerated before the server will start.
- All `process.env.JWT_SECRET!` and `process.env.JWT_SECRET as string` occurrences (auth.routes.ts:38, auth.routes.ts:85, middleware/auth.ts:35) must be replaced with `env.JWT_SECRET`.
- The hardcoded `expiresIn: '7d'` in auth.routes.ts (lines 39 and 86) must be replaced with `env.JWT_EXPIRES_IN`.
- The `.env` file must have `FRONTEND_URL` added (even if just `http://localhost:4200` for now).
