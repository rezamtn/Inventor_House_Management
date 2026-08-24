import session from '../server/session.cjs';
import upstreamHelpers from '../server/upstream.cjs';

const { hasAllowedOrigin, requireSession } = session;
const { bodyAsObject, inventoryRequest, passInventoryResponse } = upstreamHelpers;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') { res.setHeader('Allow', 'GET, PUT'); return res.status(405).json({ error: 'method_not_allowed' }); }
  if (!requireSession(req, res)) return;
  if (req.method === 'PUT' && !hasAllowedOrigin(req)) return res.status(403).json({ error: 'origin_not_allowed' });
  try {
    if (req.method === 'GET') return passInventoryResponse(await inventoryRequest('/api/inventory'), res);
    const versionToken = req.headers['x-inventory-version'];
    if (typeof versionToken !== 'string') return res.status(428).json({ error: 'inventory_version_required' });
    const body = bodyAsObject(req);
    if (!body || Array.isArray(body) || !Array.isArray(body.houses)) return res.status(400).json({ error: 'invalid_inventory' });
    const upstream = await inventoryRequest('/api/inventory', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': versionToken }, body: JSON.stringify(body)
    });
    return passInventoryResponse(upstream, res);
  } catch (error) {
    console.error('inventory proxy failed', error?.message || error);
    return res.status(503).json({ error: 'service_unavailable' });
  }
}
