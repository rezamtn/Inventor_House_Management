import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';

const { Pool } = pg;

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'API_TOKEN', 'ALLOWED_ORIGIN'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (process.env.API_TOKEN.length < 32) throw new Error('API_TOKEN must contain at least 32 characters');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');

const allowedOrigin = process.env.ALLOWED_ORIGIN.replace(/\/$/, '');
const expectedTokenHash = crypto.createHash('sha256').update(process.env.API_TOKEN).digest();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'inventory-api'
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  if (origin) {
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
    res.set('Access-Control-Expose-Headers', 'ETag');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb', strict: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip
    }));
  });
  next();
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return res.status(401).json({ error: 'unauthorized' });
  const actual = crypto.createHash('sha256').update(match[1]).digest();
  if (!crypto.timingSafeEqual(actual, expectedTokenHash)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

const inventoryLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

function makeEtag(timestampText) {
  return `"${Buffer.from(timestampText, 'utf8').toString('base64url')}"`;
}

function timestampFromEtag(value) {
  if (!value || !/^"[A-Za-z0-9_-]+"$/.test(value)) return null;
  try {
    return Buffer.from(value.slice(1, -1), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

app.get('/api/inventory', authenticate, inventoryLimiter, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, data, updated_at::text AS updated_at
         FROM app.inventory
        WHERE id = $1`,
      ['main']
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'inventory_not_found' });
    const row = result.rows[0];
    res.set('Cache-Control', 'no-store');
    res.set('ETag', makeEtag(row.updated_at));
    res.json({ id: row.id, data: row.data, updatedAt: row.updated_at });
  } catch (error) {
    next(error);
  }
});

app.put('/api/inventory', authenticate, inventoryLimiter, async (req, res, next) => {
  const expectedTimestamp = timestampFromEtag(req.get('if-match'));
  if (!expectedTimestamp) {
    return res.status(428).json({ error: 'if_match_required' });
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || !Array.isArray(req.body.houses)) {
    return res.status(400).json({ error: 'invalid_inventory', message: 'JSON body must be an object with a houses array' });
  }

  try {
    const result = await pool.query(
      `UPDATE app.inventory
          SET data = $1::jsonb,
              updated_at = clock_timestamp()
        WHERE id = $2
          AND updated_at = $3::timestamptz
      RETURNING id, data, updated_at::text AS updated_at`,
      [JSON.stringify(req.body), 'main', expectedTimestamp]
    );
    if (result.rowCount === 0) {
      const exists = await pool.query('SELECT 1 FROM app.inventory WHERE id = $1', ['main']);
      if (exists.rowCount === 0) return res.status(404).json({ error: 'inventory_not_found' });
      return res.status(412).json({ error: 'inventory_changed', message: 'GET the latest inventory and retry' });
    }
    const row = result.rows[0];
    res.set('Cache-Control', 'no-store');
    res.set('ETag', makeEtag(row.updated_at));
    res.json({ id: row.id, data: row.data, updatedAt: row.updated_at });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'invalid_json' });
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), error: error?.message || 'unknown_error' }));
  res.status(503).json({ error: 'service_unavailable' });
});

const server = app.listen(port, '0.0.0.0', () => console.log(`inventory-api listening on ${port}`));

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
