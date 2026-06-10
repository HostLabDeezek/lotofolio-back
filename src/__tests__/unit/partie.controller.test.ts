import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/partie.service.js', () => ({
  default: {
    jouer: vi.fn(),
    getHistory: vi.fn(),
    getPartieDetail: vi.fn(),
  },
}));

import partieController from '../../controllers/partie.controller.js';
import partieService from '../../services/partie.service.js';
import { AppError } from '../../errors/AppError.js';

const validGrille = { numeros: [1, 5, 12, 23, 34], numeroChance: [2, 7] };

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('PartieController.jouer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repond 201 sans body quand la partie est jouee', async () => {
    const req: any = { userId: 1, body: { tirageId: 1, grilles: [validGrille] } };
    const res = makeRes();
    const next = vi.fn();

    await partieController.jouer(req, res, next);

    expect(partieService.jouer).toHaveBeenCalledWith(1, 1, [validGrille]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

// LF-38 : getHistory

describe('PartieController.getHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repond 200 avec le tableau retourne par le service', async () => {
    const fakeHistory = [
      { partieId: 1, tirageId: 10, dateTirage: '2026-05-31T18:30:00.000Z', jeu: { id: 2, nom: 'Loto' } },
    ];
    vi.mocked(partieService.getHistory).mockResolvedValue(fakeHistory);

    const req: any = { userId: 1 };
    const res = makeRes();
    const next = vi.fn();

    await partieController.getHistory(req, res, next);

    expect(partieService.getHistory).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith(fakeHistory);
    expect(next).not.toHaveBeenCalled();
  });

  it('passe erreur a next si le service rejette', async () => {
    const err = new AppError('INTERNAL', 500, 'DB error');
    vi.mocked(partieService.getHistory).mockRejectedValue(err);

    const req: any = { userId: 1 };
    const res = makeRes();
    const next = vi.fn();

    await partieController.getHistory(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});

// LF-39 : getPartieDetail

describe('PartieController.getPartieDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repond 200 avec le detail retourne par le service', async () => {
    const fakeDetail = {
      partieId: 5,
      tirage: {
        id: 10,
        dateTirage: '2026-05-31T18:30:00.000Z',
        numerosTires: [7, 14],
        numeroChanceTire: [3],
        jeu: { id: 2, nom: 'Loto' },
      },
      grilles: [{ numeros: [7, 11, 14, 28, 31], numeroChance: [3] }],
    };
    vi.mocked(partieService.getPartieDetail).mockResolvedValue(fakeDetail);

    const req: any = { userId: 1, params: { id: '5' } };
    const res = makeRes();
    const next = vi.fn();

    await partieController.getPartieDetail(req, res, next);

    expect(partieService.getPartieDetail).toHaveBeenCalledWith(1, 5);
    expect(res.json).toHaveBeenCalledWith(fakeDetail);
    expect(next).not.toHaveBeenCalled();
  });

  it('repond 404 si :id nest pas un entier valide', async () => {
    const req: any = { userId: 1, params: { id: 'abc' } };
    const res = makeRes();
    const next = vi.fn();

    await partieController.getPartieDetail(req, res, next);

    expect(partieService.getPartieDetail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 'PARTIE_NOT_FOUND', message: 'Partie introuvable' });
  });

  it('passe erreur a next si le service rejette PARTIE_NOT_FOUND', async () => {
    const err = new AppError('PARTIE_NOT_FOUND', 404, 'Partie introuvable');
    vi.mocked(partieService.getPartieDetail).mockRejectedValue(err);

    const req: any = { userId: 1, params: { id: '999' } };
    const res = makeRes();
    const next = vi.fn();

    await partieController.getPartieDetail(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
