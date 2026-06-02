import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { TEST_JWT_SECRET } = vi.hoisted(() => ({
  TEST_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
}));

vi.mock('../../config/env.js', () => ({
  env: {
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_EXPIRES_IN: '7d',
    PORT: 3000,
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:4200',
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    jeu: { findUnique: vi.fn() },
    tirage: { findFirst: vi.fn() },
  },
}));

vi.mock('../../lib/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import express from 'express';
import tirageRoutes from '../../routes/tirage.routes.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { prisma } from '../../lib/prisma.js';
import type { Tirage } from '../../generated/prisma/client.js';
import { TirageStatus } from '../../generated/prisma/client.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/jeux', tirageRoutes);
  app.use(errorHandler);
  return app;
}

function makeValidToken(userId: number = 1): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

function makeTirage(overrides: Partial<Tirage> = {}): Tirage {
  return {
    id: 1,
    jeuId: 1,
    dateTirage: new Date('2024-06-16T18:00:00.000Z'),
    numerosTires: [],
    numeroChanceTire: [],
    status: TirageStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GET /api/jeux/:id/current-tirage', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  it("renvoie 401 si aucun JWT n'est fourni", async () => {
    const res = await request(app).get('/api/jeux/1/current-tirage');

    expect(res.status).toBe(401);
  });

  it('renvoie 200 et le payload du tirage quand un tirage est en cours', async () => {
    const tirage = makeTirage();
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(tirage as any);

    const res = await request(app)
      .get('/api/jeux/1/current-tirage')
      .set('Authorization', `Bearer ${makeValidToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, jeuId: 1 });
  });

  it('renvoie 404 avec le code NO_CURRENT_TIRAGE quand aucun tirage en cours', async () => {
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/jeux/1/current-tirage')
      .set('Authorization', `Bearer ${makeValidToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NO_CURRENT_TIRAGE' });
  });
});