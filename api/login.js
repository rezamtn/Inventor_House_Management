import session from '../server/session.cjs';
import upstream from '../server/upstream.cjs';

const { clearLoginFailures, checkLoginRateLimit, createSessionCookie, hasAllowedOrigin, verifyPassword } = session;
const { bodyAsObject } = upstream;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!hasAllowedOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  if (!checkLoginRateLimit(req)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'too_many_attempts' }); }
  let body;
  try { body = bodyAsObject(req); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  if (typeof body?.password !== 'string' || body.password.length < 12 || body.password.length > 256) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  try {
    if (!(await verifyPassword(body.password))) return res.status(401).json({ error: 'invalid_credentials' });
    clearLoginFailures(req);
    res.setHeader('Set-Cookie', createSessionCookie());
    return res.status(200).json({ authenticated: true });
  } catch (error) {
    console.error('login failed', error?.message || error);
    return res.status(503).json({ error: 'service_unavailable' });
  }
}
