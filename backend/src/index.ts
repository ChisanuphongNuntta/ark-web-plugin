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
import { setupSocketIO } from './websocket/index.js';
import { startDiscordBot, registerCommands } from './discord/bot.js';

dotenv.config();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files (for uploaded media)
app.use('/uploads', express.static('public/uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userApiRoutes); // User API Key Management
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/plugin', pluginRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pdpa', pdpaRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/content', contentRoutes);

// Protection Routes
app.use('/api/plugin/protection', protectionPluginRoutes); // Plugin API (API Key auth)
app.use('/api/protection', protectionUserRoutes);          // User API (JWT auth)
app.use('/api/admin/protection', protectionAdminRoutes);   // Admin API (JWT + Admin role)

// Dino Marketplace Routes
app.use('/api/market', dinoMarketRoutes);
app.use('/api/plugin/market', dinoMarketRoutes); // Also mount under /api/plugin for plugin compatibility

// Chat Routes (for plugin polling and web)
app.use('/api/chat', chatRoutes);
app.use('/api/plugin/chat', chatRoutes); // Also mount under /api/plugin for plugin compatibility

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
    await setupSocketIO(httpServer);
    console.log('Socket.IO WebSocket server ready');

    // Start Discord bot
    const discordBot = await startDiscordBot();
    if (discordBot) {
      // Register commands after bot is ready
      setTimeout(() => registerCommands(), 2000);
    }

    httpServer.listen(PORT, () => {
      console.log(`Heart Shop API running on http://localhost:${PORT}`);
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

startServer();

export default app;
