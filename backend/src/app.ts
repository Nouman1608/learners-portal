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
import { verifyFilePath, signFileLinks } from './utils/fileLinks';

const app: Application = express();

// Trust proxy (required when behind nginx reverse proxy)
// Trust only the first proxy (nginx on same machine)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: [
      ...env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean),
      // The mobile app's built-in web view (Capacitor): Android, then iOS.
      'https://localhost',
      'capacitor://localhost',
    ],
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Uploaded files: only with the signature the API put on the link (see utils/fileLinks.ts).
// Before the rate limit, as nginx served them before: a PDF viewer asks for many parts.
// Use UPLOAD_DIR environment variable for upload directory location
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use(
  '/uploads',
  (req, res, next) => {
    if (!verifyFilePath(req.originalUrl.split('?')[0], req.query.sig)) {
      return res.status(403).json({ error: 'This file link is not valid' });
    }
    res.setHeader('Cache-Control', 'private, no-cache');
    // A file, not a page: the portal's page policy would stop browsers showing PDFs
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadDir, { cacheControl: false })
);

// Rate limiting
app.use(globalRateLimiter);

// Request logging
app.use(requestLogger);

// Every file link the API hands out is signed (res.locals.fileCampus: another campus's files)
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(signFileLinks(body, res.locals.fileCampus));
  next();
});

// Serve public files (OAuth success page, etc.)
app.use(express.static(path.join(process.cwd(), 'public')));

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
