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
            await partieService.jouer(req.userId!, tirageId, grilles);
            res.status(201).send();
        } catch (error) {
            next(error);
        }
    }
}

export default new PartieController();