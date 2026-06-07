import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/partie.service.js', () => ({
  default: { jouer: vi.fn() },
}));

import partieController from '../../controllers/partie.controller.js';
import partieService from '../../services/partie.service.js';

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

  it('répond 201 sans body quand la partie est jouée', async () => {
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
