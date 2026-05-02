import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  logger.error(error instanceof Error ? error.message : String(error), { stack: error instanceof Error ? error.stack : undefined });
  res.status(500).json({ error: 'Erreur serveur interne' });
}
