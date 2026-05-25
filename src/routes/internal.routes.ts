import { Router } from 'express';
import { internalCronMiddleware } from '../middleware/internalCron.middleware.js';
import tirageController from '../controllers/tirage.controller.js';

const router = Router();

router.post('/tirages/create-tomorrow', internalCronMiddleware, tirageController.createTomorrowTirages);
router.post('/tirages/perform-today', internalCronMiddleware, tirageController.performTodayDraws);

export default router;