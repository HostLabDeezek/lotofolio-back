import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger.js';
import { AppError } from '../errors/AppError.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  logger.error(error instanceof Error ? error.message : String(error), { stack: error instanceof Error ? error.stack : undefined });
  res.status(500).json({ error: 'Erreur serveur interne' });
}
