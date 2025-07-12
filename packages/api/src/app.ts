import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import dotenv from 'dotenv';

// Import custom modules
import { logger } from './utils/logger';
import { DatabaseConnection } from './utils/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { setupSocketHandlers } from './sockets';

// Import routes
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import documentRoutes from './routes/documents';
import voiceRoutes from './routes/voice';
import analyticsRoutes from './routes/analytics';
import chatRoutes from './routes/chat';

// Load environment variables
dotenv.config();

class App {
  public app: express.Application;
  public httpServer: any;
  public io!: Server;
  private redis!: Redis;
  private db!: DatabaseConnection;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.setupMiddleware();
    this.setupDatabase();
    this.setupRedis();
    this.setupSocketIO();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // PATTERN: Middleware stack order is critical (from PRP)
    
    // Security headers first
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // Compression for better performance
    this.app.use(compression());

    // CORS before other middleware
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Body parsing with large limit for file uploads (from PRP)
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(cookieParser());

    // Rate limiting (from PRP pattern)
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5, // More restrictive for auth endpoints
      message: 'Too many authentication attempts',
    });

    const llmLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 50, // More restrictive for LLM calls (from PRP)
      message: 'Too many LLM requests from this IP',
    });

    // Apply rate limiting to specific routes
    this.app.use('/api/auth', authLimiter);
    this.app.use('/api/chat', llmLimiter);
    this.app.use('/api/voice', llmLimiter);
    this.app.use('/api', generalLimiter);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });
      next();
    });

    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      });
    });
  }

  private async setupDatabase(): Promise<void> {
    try {
      this.db = new DatabaseConnection();
      await this.db.connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed:', error);
      process.exit(1);
    }
  }

  private setupRedis(): void {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error:', error);
      });
    } catch (error) {
      logger.error('Redis setup failed:', error);
    }
  }

  private setupSocketIO(): void {
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Setup Redis adapter for scaling (from PRP)
    if (this.redis) {
      const pubClient = this.redis;
      const subClient = this.redis.duplicate();
      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter configured');
    }

    // Setup socket event handlers
    setupSocketHandlers(this.io, this.db);
  }

  private setupRoutes(): void {
    // API routes with versioning
    const apiRouter = express.Router();

    // Public routes (no auth required)
    apiRouter.use('/auth', authRoutes);

    // Protected routes (auth required)
    apiRouter.use('/conversations', authMiddleware, conversationRoutes);
    apiRouter.use('/messages', authMiddleware, messageRoutes);
    apiRouter.use('/chat', authMiddleware, chatRoutes);
    apiRouter.use('/documents', authMiddleware, documentRoutes);
    apiRouter.use('/voice', authMiddleware, voiceRoutes);
    apiRouter.use('/analytics', authMiddleware, analyticsRoutes);

    // Mount API routes
    this.app.use('/api', apiRouter);

    // Serve uploaded files (with auth)
    this.app.use('/uploads', authMiddleware, express.static('uploads'));
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // CRITICAL: Error handling must be last middleware (from PRP)
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    const port = process.env.PORT || 3001;
    
    this.httpServer.listen(port, () => {
      logger.info(`Server running on port ${port}`, {
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down server...');

    // Close HTTP server
    this.httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connection
    if (this.db) {
      await this.db.disconnect();
      logger.info('Database connection closed');
    }

    // Close Redis connection
    if (this.redis) {
      this.redis.disconnect();
      logger.info('Redis connection closed');
    }

    process.exit(0);
  }
}

// Create and start the application
const app = new App();

// Only start if this file is run directly
if (require.main === module) {
  app.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { app };
export default app;