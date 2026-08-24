import session from '../server/session.cjs';
import upstreamHelpers from '../server/upstream.cjs';

const { hasAllowedOrigin, requireSession } = session;
const { bodyAsObject, inventoryRequest, passJsonResponse } = upstreamHelpers;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!requireSession(req, res)) return;
  if (!hasAllowedOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  try {
    const body = bodyAsObject(req);
    if (!body) return res.status(400).json({ error: 'invalid_request' });
    const upstream = await inventoryRequest('/api/push-subscriptions', {
      method: req.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return passJsonResponse(upstream, res);
  } catch (error) {
    console.error('subscription proxy failed', error?.message || error);
    return res.status(503).json({ error: 'service_unavailable' });
  }
}
