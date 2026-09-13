import 'express-async-errors';
import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { globalRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';
import env from './config/env';

const app: Application = express();

// Trust proxy (required when behind nginx reverse proxy)
// Trust only the first proxy (nginx on same machine)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Rate limiting
app.use(globalRateLimiter);

// Request logging
app.use(requestLogger);

// Serve uploaded files statically
// Use UPLOAD_DIR environment variable for upload directory location
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadDir));

// Serve public files (OAuth success page, etc.)
app.use(express.static(path.join(process.cwd(), 'public')));

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
