import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import userApiRoutes from './routes/user-api.routes.js';
import productRoutes from './routes/product.routes.js';
import serverRoutes from './routes/server.routes.js';
import siteRoutes from './routes/site.routes.js';
import orderRoutes from './routes/order.routes.js';
import pluginRoutes from './routes/plugin.routes.js';
import adminRoutes from './routes/admin.routes.js';
import pdpaRoutes from './routes/pdpa.routes.js';
import auditRoutes from './routes/audit.routes.js';
import contentRoutes from './routes/content.routes.js';
import { protectionPluginRoutes, protectionUserRoutes, protectionAdminRoutes } from './routes/protection.routes.js';
import dinoMarketRoutes from './routes/dino-market.routes.js';
import chatRoutes from './routes/chat.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import cartRoutes from './routes/cart.routes.js';
import checkoutRoutes from './routes/checkout.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import promotionRoutes from './routes/promotion.routes.js';
import vipRoutes from './routes/vip.routes.js';
import { setupSocketIO } from './websocket/index.js';
import { startDiscordBot, registerCommands, sendToDiscord } from './discord/bot.js';
import { startDiscordRelaySubscriber } from './discord/relay.js';
import { getServiceRole, servesPlugin, servesWeb } from './config/serviceRole.js';
import serverQueryService from './services/serverQuery.service.js';
import { ledgerReconcileScheduler } from './services/ledgerReconcile.service.js';
import { vipExpiryScheduler } from './services/vipScheduler.service.js';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'FRONTEND_URL', 'PLUGIN_API_URL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET!.length < 32 || process.env.ENCRYPTION_KEY!.length < 32) {
    throw new Error('JWT_SECRET and ENCRYPTION_KEY must each contain at least 32 characters');
  }
}

const SERVICE_ROLE = getServiceRole();
const app = express();
const PORT = process.env.PORT || 3001;

// Security middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Enable trust proxy for Docker/Nginx
app.set('trust proxy', 1);

// Rate limiting - General API
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Plugin traffic has its own per-server limiter; all local game servers share one NAT IP.
  skip: (req) => req.originalUrl.startsWith('/api/plugin'),
});

// Rate limiting - Plugin API (higher limit for server communication)
const pluginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 500, // 500 requests per server per 5 minutes (allows ~1.6 req/sec)
  message: { error: 'Too many requests from plugin, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use Server ID or API Key if available, otherwise fall back to IP
    return (req.headers['x-server-id'] as string) ||
      (req.headers['x-api-key'] as string) ||
      req.ip ||
      'unknown';
  }
});

// Apply rate limiters
app.use('/api/plugin', pluginLimiter);
app.use('/api/', generalLimiter);

// Body parsing
// Payment signatures cover the exact request bytes; mount this before express.json().
app.use('/api/payments/webhooks', express.raw({ type: 'application/json', limit: '256kb' }));
// Native ARK dino snapshots are base64 encoded and signed by the server plugin.
// Keep a bounded limit that accommodates them without accepting unbounded bodies.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files (for uploaded media)
app.use('/uploads', express.static('public/uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', role: SERVICE_ROLE, timestamp: new Date().toISOString() });
});

if (servesWeb(SERVICE_ROLE)) {
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/user', userApiRoutes); // User API Key Management
  app.use('/api/products', productRoutes);
  app.use('/api/servers', serverRoutes); // Public server directory (ServerStatus, isOnline derived from lastHeartbeat)
  app.use('/api/site', siteRoutes); // Public site settings (season theme, announcement)
  app.use('/api/orders', orderRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/checkout', checkoutRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/vip', vipRoutes); // VIP packages / me / badges / checkout (contracts/vip-2026-10.md)
  app.use('/api/admin', adminRoutes);
  app.use('/api/pdpa', pdpaRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/protection', protectionUserRoutes);          // User API (JWT auth)
  app.use('/api/admin/protection', protectionAdminRoutes);   // Admin API (JWT + Admin role)
  app.use('/api/market', dinoMarketRoutes);
  app.use('/api/chat', chatRoutes);
}

// Signed game-server API. In production it runs in the separate plugin-gateway process,
// which nginx exposes only on a host-loopback port (see docker/nginx/conf.d/heartshop.conf).
if (servesPlugin(SERVICE_ROLE)) {
  app.use('/api/plugin', pluginRoutes);
  app.use('/api/plugin/protection', protectionPluginRoutes); // Plugin API (API Key auth)
  app.use('/api/plugin/market', dinoMarketRoutes); // Also mount under /api/plugin for plugin compatibility
  app.use('/api/plugin/chat', chatRoutes); // Also mount under /api/plugin for plugin compatibility
}

// Error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO and Discord bot
async function startServer() {
  try {
    // The gateway also attaches Socket.IO so its emits reach web clients through the Redis adapter.
    await setupSocketIO(httpServer);
    console.log('Socket.IO WebSocket server ready');

    if (servesWeb(SERVICE_ROLE)) {
      // One Discord process only (see docker-compose backend replicas note).
      const discordBot = await startDiscordBot();
      if (discordBot) {
        // Register commands after bot is ready
        setTimeout(() => registerCommands(), 2000);
      }
      if (SERVICE_ROLE === 'web') await startDiscordRelaySubscriber(sendToDiscord);

      // Live A2S server status poller. Web process only; a Redis lock keeps it to one replica.
      serverQueryService.start();
      // Ledger reconciliation every 15 min (Redis lock: one replica per window). Emits
      // admin:ledger:mismatch to room admin when cached balances drift from the ledger.
      ledgerReconcileScheduler.start();
      // VIP expiry every minute (Redis lock: one replica per window). Expires memberships and
      // queues the Permissions-group removal when nothing else keeps the group.
      vipExpiryScheduler.start();
      // Release the poller lock on shutdown so the next instance takes over immediately, then
      // re-raise the signal for the default exit (listeners are one-shot).
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
          ledgerReconcileScheduler.stop();
          vipExpiryScheduler.stop();
          void serverQueryService.stop().finally(() => process.kill(process.pid, signal));
        });
      }
    }

    httpServer.listen(PORT, () => {
      console.log(`Heart Shop API (${SERVICE_ROLE}) running on http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to setup services:', error);
    // Start without optional services
    httpServer.listen(PORT, () => {
      console.log(`Heart Shop API running on http://localhost:${PORT} (some services disabled)`);
    });
  }
}

// Last line of defence: a stray rejected promise (e.g. a socket handler fed a malformed payload)
// must be logged, not take down every user's realtime connection (Node >= 15 exits by default).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

startServer();

export default app;
