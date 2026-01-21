import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

import { authRouter } from './routes/auth.js';
import { promptRouter } from './routes/prompts.js';
import { userRouter } from './routes/users.js';
import { healthRouter } from './routes/health.js';
import { subscriptionRouter } from './routes/subscriptions.js';
import { webhookRouter } from './routes/webhooks.js';
import { errorHandler } from './middleware/errorHandler.js';
import { prisma } from './utils/prisma.js';

config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Trust proxy (Railway, Vercel, etc.) for correct client IP in rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env['CORS_ORIGIN'] || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000'),
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing & compression
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env['NODE_ENV'] !== 'test') {
  app.use(morgan('combined'));
}

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/prompts', promptRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/webhooks', webhookRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;

// Start server immediately without blocking on database
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`📦 Database URL: ${process.env['DATABASE_URL'] ? 'configured' : 'NOT SET'}`);
});

export default app;
