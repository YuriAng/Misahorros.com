// Express app: serves the `/api/*` JSON contract and the built Vite assets
// from the same process/port (design.md "Express as the API layer").
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRouter from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();

app.use(express.json());

app.use('/api', apiRouter);

// Any /api/* path not matched by a resource router is an unknown endpoint,
// not a static asset — keep the JSON error shape instead of falling through
// to express.static / the HTML 404.
app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: `No such endpoint: ${req.method} ${req.originalUrl}` },
  });
});

app.use(express.static(distDir));

// Centralized error middleware: every thrown ApiError, plus raw Postgres
// constraint violations, lands here with the shared
// `{ error: { code, message, field? } }` shape (design.md REST API Contract).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.status) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.field) body.error.field = err.field;
    return res.status(err.status).json(body);
  }

  // Postgres SQLSTATE: check_violation, foreign_key_violation, unique_violation.
  if (err.code === '23514' || err.code === '23503' || err.code === '23505') {
    return res.status(400).json({
      error: { code: 'bad_request', message: err.detail || err.message },
    });
  }

  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
});

const port = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`budget-pwa server listening on port ${port}`);
  });
}

export default app;
