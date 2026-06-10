import { Router } from 'express';
import partieController from '../controllers/partie.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/parties/history — doit être avant /:id pour éviter la collision de routes
router.get('/history', authMiddleware, partieController.getHistory.bind(partieController));
router.get('/:id', authMiddleware, partieController.getPartieDetail.bind(partieController));
router.post('/', authMiddleware, partieController.jouer.bind(partieController));

export default router;
