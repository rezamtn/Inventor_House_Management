import session from '../server/session.cjs';

const { clearSessionCookie, hasAllowedOrigin } = session;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!hasAllowedOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ authenticated: false });
}
