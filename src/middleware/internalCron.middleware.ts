import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import logger from '../lib/logger.js';

export const internalCronMiddleware = (req: Request, res: Response, next: NextFunction) => {

    const secretKey = req.headers['x-internal-cron-secret'];
    const expectedSecretKey = process.env.INTERNAL_CRON_SECRET;

    if (!secretKey || typeof secretKey !== 'string' || !expectedSecretKey) {
        const ip = req.ip ?? req.socket.remoteAddress;
        logger.warn('[internalCron] Accès refusé', { ip, reason: 'header absent ou INTERNAL_CRON_SECRET non configuré' });
        res.status(401).json({ error: 'Non autorisé' });
        return;
    }

    const secretBuf = Buffer.from(secretKey);
    const expectedBuf = Buffer.from(expectedSecretKey);

    if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
        const ip = req.ip ?? req.socket.remoteAddress;
        logger.warn('[internalCron] Secret incorrect', { ip });
        res.status(401).json({ error: 'Non autorisé' });
        return;
    }

    next();

};