function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function inventoryRequest(path, options = {}) {
  const baseUrl = requiredEnv('INVENTORY_API_URL').replace(/\/$/, '');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${requiredEnv('INVENTORY_API_TOKEN')}`);
  headers.set('Accept', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(10_000) });
}

function bodyAsObject(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return null;
}

async function passJsonResponse(upstream, res) {
  const text = await upstream.text();
  const etag = upstream.headers.get('etag');
  if (etag) res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(upstream.status).send(text);
}

async function passInventoryResponse(upstream, res) {
  const text = await upstream.text();
  const versionToken = upstream.headers.get('etag');
  let output = text;
  try {
    const body = JSON.parse(text);
    if (versionToken && body && typeof body === 'object' && !Array.isArray(body)) {
      body.versionToken = versionToken;
    }
    output = JSON.stringify(body);
  } catch {
    // Preserve the upstream response so diagnostics are not hidden.
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(upstream.status).send(output);
}

module.exports = { bodyAsObject, inventoryRequest, passInventoryResponse, passJsonResponse };
