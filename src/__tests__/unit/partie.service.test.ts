import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    tirage: { findUnique: vi.fn() },
    partie: { upsert: vi.fn() },
  },
}));

import { PartieService } from '../../services/partie.service.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import type { Jeu, Tirage } from '../../generated/prisma/client.js';
import { TirageStatus } from '../../generated/prisma/client.js';

const FIXED_NOW = new Date('2024-06-15T18:00:00.000Z').getTime();

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

function makeTirage(overrides: Partial<Tirage & { jeu: Jeu }> = {}): Tirage & { jeu: Jeu } {
  return {
    id: 1,
    jeuId: 1,
    dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000),
    numerosTires: [],
    numeroChanceTire: [],
    status: TirageStatus.PENDING,
    createdAt: new Date(),
    jeu: makeJeu(),
    ...overrides,
  };
}

const validGrille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2, 7] };

describe('PartieService.jouer', () => {
  let service: PartieService;

  beforeEach(() => {
    service = new PartieService();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lance TIRAGE_NOT_FOUND si le tirage n'existe pas", async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(null);

    await expect(service.jouer(1, 999, [validGrille])).rejects.toMatchObject({
      code: 'TIRAGE_NOT_FOUND',
    });
    await expect(service.jouer(1, 999, [validGrille])).rejects.toBeInstanceOf(AppError);
  });

  it('lance CUTOFF_PASSED (409) si le tirage est trop proche (sous la marge)', async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 5 * 60 * 1000), // dans 5 min, sous la marge de 6 min
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await expect(service.jouer(1, 1, [validGrille])).rejects.toMatchObject({
      code: 'CUTOFF_PASSED',
      statusCode: 409,
    });
  });

  it("lance CUTOFF_PASSED si le tirage n'est pas PENDING (déjà tiré)", async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000), // dans 1h, hors marge
      status: TirageStatus.DONE,
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await expect(service.jouer(1, 1, [validGrille])).rejects.toMatchObject({
      code: 'CUTOFF_PASSED',
      statusCode: 409,
    });
  });

  it('crée la partie et les grilles via upsert quand le tirage est valide', async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000), // dans 1h, hors marge
      status: TirageStatus.PENDING,
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await service.jouer(1, 1, [validGrille]);

    expect(prisma.partie.upsert).toHaveBeenCalledWith({
      where: { userId_tirageId: { userId: 1, tirageId: 1 } },
      create: {
        userId: 1,
        tirageId: 1,
        grilles: { create: [{ numeros: validGrille.numeros, numeroChance: validGrille.numeroChance }] },
      },
      update: {
        grilles: { create: [{ numeros: validGrille.numeros, numeroChance: validGrille.numeroChance }] },
      },
    });
  });

  it('rejette INVALID_GRILLE si le nombre de numéros est incorrect', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12], numeroChance: [2, 7] }; // 3 au lieu de 5

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si le nombre de numéros chance est incorrect', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2] }; // 1 au lieu de 2

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro est hors plage', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 99], numeroChance: [2, 7] }; // 99 > 50

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro chance est hors plage', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2, 99] }; // 99 > 12

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro est répété dans une grille', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 1, 12, 23, 34], numeroChance: [2, 7] };

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro chance est répété dans une grille', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [7, 7] };

    await expect(service.jouer(1, 1, [grille])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si deux grilles sont identiques', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());

    await expect(service.jouer(1, 1, [validGrille, { ...validGrille }])).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });
});
