import { Request, Response, NextFunction } from 'express';
import partieService from '../services/partie.service.js';
import { grilleSchema } from '../validators/grille.validator.js';

class PartieController {

  async jouer(req: Request, res: Response, next: NextFunction) {
    try {
      const result = grilleSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          code: 'INVALID_PAYLOAD',
          details: result.error.issues.map(i => ({ field: String(i.path[0]), message: i.message }))
        });
      }

      const { tirageId, grilles } = result.data;
      await partieService.jouer(req.userId!, tirageId, grilles, req.userRole!);
      res.status(201).send();
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await partieService.getHistory(req.userId!);
      res.json(history);
    } catch (error) {
      next(error);
    }
  }

  async getPartieDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const partieId = Number(req.params["id"]);
      if (!Number.isInteger(partieId) || partieId <= 0) {
        return res.status(404).json({ code: 'PARTIE_NOT_FOUND', message: 'Partie introuvable' });
      }
      const detail = await partieService.getPartieDetail(req.userId!, partieId);
      res.json(detail);
    } catch (error) {
      next(error);
    }
  }
}

export default new PartieController();
