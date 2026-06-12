import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/prisma.js', () => {
  const mockPrisma: any = {
    tirage: { findUnique: vi.fn() },
    partie: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  // $transaction passes the same mock client as tx so all tx.* calls use the same vi.fn()s.
  mockPrisma.$transaction = vi.fn().mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

import { PartieService } from '../../services/partie.service.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import type { Jeu, Tirage } from '../../generated/prisma/client.js';
import { TirageStatus } from '../../generated/prisma/client.js';
import { Role } from '../../generated/prisma/enums.js';

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
    // No existing grilles by default — grille limit check passes.
    vi.mocked(prisma.partie.findUnique).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lance TIRAGE_NOT_FOUND si le tirage n'existe pas", async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(null);

    await expect(service.jouer(1, 999, [validGrille], Role.USER)).rejects.toMatchObject({
      code: 'TIRAGE_NOT_FOUND',
    });
    await expect(service.jouer(1, 999, [validGrille], Role.USER)).rejects.toBeInstanceOf(AppError);
  });

  it('lance CUTOFF_PASSED (409) si le tirage est trop proche (sous la marge)', async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 5 * 60 * 1000),
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await expect(service.jouer(1, 1, [validGrille], Role.USER)).rejects.toMatchObject({
      code: 'CUTOFF_PASSED',
      statusCode: 409,
    });
  });

  it("lance CUTOFF_PASSED si le tirage n'est pas PENDING (déjà tiré)", async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000),
      status: TirageStatus.DONE,
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await expect(service.jouer(1, 1, [validGrille], Role.USER)).rejects.toMatchObject({
      code: 'CUTOFF_PASSED',
      statusCode: 409,
    });
  });

  it('crée la partie et les grilles via upsert quand le tirage est valide', async () => {
    const tirage = makeTirage({
      dateTirage: new Date(FIXED_NOW + 60 * 60 * 1000),
      status: TirageStatus.PENDING,
    });
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(tirage);

    await service.jouer(1, 1, [validGrille], Role.USER);

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
    const grille = { numeros: [1, 5, 12], numeroChance: [2, 7] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si le nombre de numéros chance est incorrect', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro est hors plage', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 99], numeroChance: [2, 7] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro chance est hors plage', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2, 99] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro est répété dans une grille', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 1, 12, 23, 34], numeroChance: [2, 7] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si un numéro chance est répété dans une grille', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());
    const grille = { numeros: [1, 5, 12, 23, 34], numeroChance: [7, 7] };

    await expect(service.jouer(1, 1, [grille], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });

  it('rejette INVALID_GRILLE si deux grilles sont identiques', async () => {
    vi.mocked(prisma.tirage.findUnique).mockResolvedValue(makeTirage());

    await expect(service.jouer(1, 1, [validGrille, { ...validGrille }], Role.USER)).rejects.toMatchObject({
      code: 'INVALID_GRILLE',
      statusCode: 400,
    });
  });
});

// ─── LF-38 : getHistory ────────────────────────────────────────────────────

describe('PartieService.getHistory', () => {
  let service: PartieService;

  const tirageDone = {
    id: 10,
    dateTirage: new Date('2026-05-31T18:30:00.000Z'),
    jeuId: 2,
    numerosTires: [7, 14, 23, 31, 42],
    numeroChanceTire: [3],
    status: TirageStatus.DONE,
    createdAt: new Date(),
    jeu: { id: 2, nom: 'Loto', description: null, regle: null, nbNumerosATirer: 5, intervalNumero: 49, nbNumeroChanceATirer: 1, intervalNumeroChance: 10, createdAt: new Date(), updatedAt: new Date() },
  };

  beforeEach(() => {
    service = new PartieService();
    vi.clearAllMocks();
  });

  it('retourne un tableau vide si aucune partie', async () => {
    vi.mocked(prisma.partie.findMany).mockResolvedValue([]);
    const result = await service.getHistory(1);
    expect(result).toEqual([]);
  });

  it('mappe correctement les champs dont dateTirage (LF-38é depuis dateTirage)', async () => {
    vi.mocked(prisma.partie.findMany).mockResolvedValue([
      { id: 5, userId: 1, tirageId: 10, createdAt: new Date(), tirage: tirageDone } as any,
    ]);

    const result = await service.getHistory(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      partieId: 5,
      tirageId: 10,
      dateTirage: '2026-05-31T18:30:00.000Z',
      jeu: { id: 2, nom: 'Loto' },
      status: TirageStatus.DONE,
    });
  });

  it('passe userId dans le where et orderBy dateTirage desc', async () => {
    vi.mocked(prisma.partie.findMany).mockResolvedValue([]);
    await service.getHistory(42);

    expect(prisma.partie.findMany).toHaveBeenCalledWith({
      where: { userId: 42 },
      include: { tirage: { include: { jeu: true } } },
      orderBy: { tirage: { dateTirage: 'desc' } },
    });
  });
});

// ─── LF-39 : getPartieDetail ───────────────────────────────────────────────

describe('PartieService.getPartieDetail', () => {
  let service: PartieService;

  const mockPartie = {
    id: 5,
    userId: 1,
    tirageId: 10,
    createdAt: new Date(),
    tirage: {
      id: 10,
      dateTirage: new Date('2026-05-31T18:30:00.000Z'),
      jeuId: 2,
      numerosTires: [7, 14, 23, 31, 42],
      numeroChanceTire: [3],
      status: TirageStatus.DONE,
      createdAt: new Date(),
      jeu: { id: 2, nom: 'Loto', description: null, regle: null, nbNumerosATirer: 5, intervalNumero: 49, nbNumeroChanceATirer: 1, intervalNumeroChance: 10, createdAt: new Date(), updatedAt: new Date() },
    },
    grilles: [
      { id: 1, partieId: 5, numeros: [7, 11, 14, 28, 31], numeroChance: [3], createdAt: new Date() },
      { id: 2, partieId: 5, numeros: [4, 23, 27, 42, 45], numeroChance: [7], createdAt: new Date() },
    ],
  };

  beforeEach(() => {
    service = new PartieService();
    vi.clearAllMocks();
  });

  it('retourne le détail structuré avec tirage et grilles', async () => {
    vi.mocked(prisma.partie.findFirst).mockResolvedValue(mockPartie as any);

    const result = await service.getPartieDetail(1, 5);

    expect(result).toEqual({
      partieId: 5,
      tirage: {
        id: 10,
        dateTirage: '2026-05-31T18:30:00.000Z',
        status: TirageStatus.DONE,
        numerosTires: [7, 14, 23, 31, 42],
        numeroChanceTire: [3],
        jeu: { id: 2, nom: 'Loto' },
      },
      grilles: [
        { numeros: [7, 11, 14, 28, 31], numeroChance: [3] },
        { numeros: [4, 23, 27, 42, 45], numeroChance: [7] },
      ],
    });
  });

  it('lève PARTIE_NOT_FOUND si partie inexistante ou autre utilisateur', async () => {
    vi.mocked(prisma.partie.findFirst).mockResolvedValue(null);

    await expect(service.getPartieDetail(1, 999)).rejects.toMatchObject({
      code: 'PARTIE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('filtre par userId et partieId dans le where', async () => {
    vi.mocked(prisma.partie.findFirst).mockResolvedValue(mockPartie as any);
    await service.getPartieDetail(7, 5);

    expect(prisma.partie.findFirst).toHaveBeenCalledWith({
      where: { id: 5, userId: 7 },
      include: {
        tirage: { include: { jeu: true } },
        grilles: true,
      },
    });
  });
});
