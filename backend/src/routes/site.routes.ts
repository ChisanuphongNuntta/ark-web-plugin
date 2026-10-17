import { Router } from 'express';
import siteController from '../controllers/site.controller.js';

const router = Router();

// Public site settings: seasonal theme (resolved for Asia/Bangkok) + announcement banner.
router.get('/settings', siteController.getSettings);

export default router;
