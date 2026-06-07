import { env } from './config/env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.routes.js';
import jeuRoutes from './routes/jeu.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './lib/logger.js';
import internalRoutes from './routes/internal.routes.js';
import tirageRoutes from './routes/tirage.routes.js';
import tirageService from './services/tirage.service.js';
import partieRoutes from './routes/partie.routes.js';

const app = express();

// Required for Render (and any reverse proxy): trust the first proxy so that
// express-rate-limit can read X-Forwarded-For without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

const allowedOrigins = env.FRONTEND_URL.split(',').map(s => s.trim());

// ✅ 1. Security headers
app.use(helmet());

// ✅ 2. CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ✅ 3. JSON Parser
app.use(express.json());

// ✅ 4. HTTP request logging (AVANT les routes !)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    logger.info(`${req.method} ${req.url} ${res.statusCode}`);
  });
  next();
});

// ✅ 5. Routes
app.use('/api/auth', authRoutes);
app.use('/api/jeux', jeuRoutes);
app.use('/api/jeux', tirageRoutes);
app.use('/api/parties', partieRoutes); // routes d'admin et de debug, protégées par authMiddleware
app.use('/internal', internalRoutes);

// ✅ 6. Routes de test
app.get('/', (req: Request, res: Response) => {
  res.json({ message: '✅ API Loto is running' });
});

// Liveness probe : le process répond. Pas d'appel BDD pour éviter de
// faire restart le service quand la BDD a juste un hoquet.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

// Readiness probe : l'instance peut servir du trafic (BDD joignable).
app.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({ status: 'ERROR', database: 'Disconnected' });
  }
});

// ✅ 7. Error handler
app.use(errorHandler);

// ✅ 8. 404
app.use((req: Request, res: Response) => {
  logger.warn(`404 - ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(env.PORT, async () => {
  logger.info(`Server listening on port ${env.PORT}`);

  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
  }
  tirageService.performPendingDraws()
    .then(report => logger.info('Catch-up: terminé', report))
    .catch(err => logger.error('Catch-up: erreur', { error: err }));
});

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
