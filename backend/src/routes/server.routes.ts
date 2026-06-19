import { Router } from 'express';
import serverController from '../controllers/server.controller.js';

const router = Router();

// Public server directory for server-selection and live-status surfaces.
// Returns ServerStatus[] with isOnline derived from lastHeartbeat. No secrets exposed.
router.get('/', serverController.getServers);

export default router;
