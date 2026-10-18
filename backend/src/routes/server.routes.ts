import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import serverController from '../controllers/server.controller.js';

const router = Router();

// Live-status endpoints are public and cheap (served from the Redis snapshot), but the players
// endpoint may trigger a deduplicated live A2S query, so both get a per-IP limit on top of the
// global /api limiter.
const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
const playersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Public server list for server-selection and live-status surfaces.
// Returns { servers: ServerSummary[] } (+ legacy ServerStatus fields). ?deliverable=true
// filters to servers shop delivery can target. No secrets exposed.
router.get('/', serverController.getServers);

// Public grouped server directory (cluster groups ordered by sortOrder). Listed servers only.
// Items carry live status from the A2S/heartbeat snapshot (contracts/realtime-2026-10.md).
router.get('/directory', serverController.getDirectory);

// Live status snapshot (same payload as the `servers:status` Socket.IO event).
router.get('/status', statusLimiter, serverController.getStatus);

// Player names for one server (A2S_PLAYER).
router.get('/:id/players', playersLimiter, serverController.getPlayers);

export default router;
