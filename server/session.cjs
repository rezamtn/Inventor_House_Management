const crypto = require('node:crypto');

const COOKIE_NAME = 'inventory_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const loginAttempts = new Map();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([name]) => name));
}

function sign(value) {
  return crypto.createHmac('sha256', requiredEnv('SESSION_SECRET')).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function hasValidSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  return safeEqual(parts[2], sign(payload));
}

function requireSession(req, res) {
  if (hasValidSession(req)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({ error: 'authentication_required' });
  return false;
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  const allowed = requiredEnv('APP_ORIGIN').replace(/\/$/, '');
  return typeof origin === 'string' && origin.replace(/\/$/, '') === allowed;
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function checkLoginRateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}

function clearLoginFailures(req) {
  loginAttempts.delete(clientKey(req));
}

function verifyPassword(password) {
  const [algorithm, saltHex, expectedHex] = requiredEnv('APP_PASSWORD_HASH').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !expectedHex) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) return reject(error);
      resolve(safeEqual(derived.toString('hex'), expectedHex));
    });
  });
}

module.exports = {
  clearLoginFailures,
  clearSessionCookie,
  checkLoginRateLimit,
  createSessionCookie,
  hasAllowedOrigin,
  hasValidSession,
  requireSession,
  verifyPassword
};
