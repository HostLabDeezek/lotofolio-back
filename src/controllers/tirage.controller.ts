import { Request, Response, NextFunction } from 'express';
import tirageService from '../services/tirage.service.js';
import logger from '../lib/logger.js';

class TirageController {

    async createTomorrowTirages(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await tirageService.createTiragesForTomorrow();
            logger.info('[POST /internal/tirages/create-tomorrow]', result);
            res.json({ ok: true, ...result });
        } catch (error) {
            logger.error('[POST /internal/tirages/create-tomorrow] Erreur', { error });
            next(error);
        }
    }

    async performTodayDraws(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await tirageService.performPendingDraws();
            logger.info('[POST /internal/tirages/perform-today]', result);
            res.json({ ok: true, ...result });
        } catch (error) {
            logger.error('[POST /internal/tirages/perform-today] Erreur', { error });
            next(error);
        }
    }

    async getCurrentTirageByJeuId(req: Request, res: Response, next: NextFunction) {
        try {
            const jeuId = parseInt(req.params.id);
            const tirage = await tirageService.getCurrentTirageByJeuId(jeuId);
            if (!tirage) {
                res.status(404).json({ code: 'NO_CURRENT_TIRAGE' });
                return;
            }
            res.json(tirage);
        } catch (error) {
            next(error);
        }
    }
}

export default new TirageController();