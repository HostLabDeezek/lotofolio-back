import { Router } from 'express';
import jeuxController from '../controllers/jeu.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, jeuxController.getAllJeux);

export default router;