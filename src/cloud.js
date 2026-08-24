let inventoryEtag = null;

export class AuthenticationRequiredError extends Error {}

async function jsonRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (response.status === 401) throw new AuthenticationRequiredError('authentication_required');
  return response;
}

export async function login(password) {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return response.ok;
}

export async function logout() {
  inventoryEtag = null;
  await jsonRequest('/api/logout', { method: 'POST' });
}

export async function loadFromCloud() {
  const response = await jsonRequest('/api/inventory');
  if (!response.ok) return null;
  inventoryEtag = response.headers.get('etag');
  const body = await response.json();
  return body?.data || null;
}

export async function saveToCloud(payload) {
  if (!inventoryEtag) return { ok: false, conflict: true };
  const response = await jsonRequest('/api/inventory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': inventoryEtag },
    body: JSON.stringify(payload)
  });
  if (response.status === 412) return { ok: false, conflict: true };
  if (!response.ok) return { ok: false, conflict: false };
  inventoryEtag = response.headers.get('etag');
  return { ok: true, conflict: false };
}
