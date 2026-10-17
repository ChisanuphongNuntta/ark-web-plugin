import { Router } from 'express';
import serverController from '../controllers/server.controller.js';

const router = Router();

// Public server list for server-selection and live-status surfaces.
// Returns { servers: ServerSummary[] } (+ legacy ServerStatus fields). ?deliverable=true
// filters to servers shop delivery can target. No secrets exposed.
router.get('/', serverController.getServers);

// Public grouped server directory (cluster groups ordered by sortOrder). Listed servers only.
router.get('/directory', serverController.getDirectory);

export default router;
