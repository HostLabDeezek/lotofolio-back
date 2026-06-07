import { Router } from 'express';
import partieController from '../controllers/partie.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/', authMiddleware, partieController.jouer);

export default router;