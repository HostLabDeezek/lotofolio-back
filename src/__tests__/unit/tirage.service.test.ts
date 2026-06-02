import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    jeu: { findUnique: vi.fn() },
    tirage: { findFirst: vi.fn() },
  },
}));

vi.mock('../../lib/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { TirageService } from '../../services/tirage.service.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import type { Jeu, Tirage } from '../../generated/prisma/client.js';
import { TirageStatus } from '../../generated/prisma/client.js';

const FIXED_NOW = new Date('2024-06-15T18:00:00.000Z').getTime();
const CUTOFF_MARGIN_MS = 6 * 60 * 1000;

function makeJeu(overrides: Partial<Jeu> = {}): Jeu {
  return {
    id: 1,
    nom: 'Euromillions',
    description: null,
    regle: null,
    nbNumerosATirer: 5,
    intervalNumero: 50,
    nbNumeroChanceATirer: 2,
    intervalNumeroChance: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTirage(overrides: Partial<Tirage> = {}): Tirage {
  return {
    id: 1,
    jeuId: 1,
    dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000),
    numerosTires: [],
    numeroChanceTire: [],
    status: TirageStatus.PENDING,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TirageService.getCurrentTirageByJeuId', () => {
  let service: TirageService;

  beforeEach(() => {
    service = new TirageService();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renvoie le tirage correct quand on est avant le cutoff', async () => {
    const tirage = makeTirage({ dateTirage: new Date(FIXED_NOW + 30 * 60 * 1000) });
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue(makeJeu() as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(tirage as any);

    const result = await service.getCurrentTirageByJeuId(1);

    expect(result).toEqual(tirage);
  });

  it('renvoie null quand on est entre le cutoff et le tirage', async () => {
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue(makeJeu() as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(null);

    const result = await service.getCurrentTirageByJeuId(1);

    expect(result).toBeNull();
    expect(prisma.tirage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dateTirage: { gt: new Date(FIXED_NOW + CUTOFF_MARGIN_MS) },
        }),
      }),
    );
  });

  it('renvoie le prochain tirage si plusieurs tirages futurs existent', async () => {
    const nextTirage = makeTirage({ id: 2, dateTirage: new Date(FIXED_NOW + 30 * 60 * 1000) });
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue(makeJeu() as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(nextTirage as any);

    const result = await service.getCurrentTirageByJeuId(1);

    expect(result).toEqual(nextTirage);
    expect(prisma.tirage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { dateTirage: 'asc' },
      }),
    );
  });

  it("lance une AppError JEU_NOT_FOUND si le jeu n'existe pas", async () => {
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue(null);

    await expect(service.getCurrentTirageByJeuId(999)).rejects.toMatchObject({
      code: 'JEU_NOT_FOUND',
    });
    await expect(service.getCurrentTirageByJeuId(999)).rejects.toBeInstanceOf(AppError);
  });

  it('ignore les tirages déjà effectués (numerosTires non vide)', async () => {
    vi.mocked(prisma.jeu.findUnique).mockResolvedValue(makeJeu() as any);
    vi.mocked(prisma.tirage.findFirst).mockResolvedValue(null);

    await service.getCurrentTirageByJeuId(1);

    expect(prisma.tirage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          numerosTires: { isEmpty: true },
        }),
      }),
    );
  });
});