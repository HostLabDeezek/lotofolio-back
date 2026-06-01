import { Router } from 'express';
import tirageController from '../controllers/tirage.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/:id/current-tirage', authMiddleware, tirageController.getCurrentTirageByJeuId);

export default router;