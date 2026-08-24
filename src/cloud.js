let inventoryVersion = null;

export class AuthenticationRequiredError extends Error {}

export class LoginError extends Error {
  constructor(status, code) {
    super(code || 'login_failed_' + status);
    this.name = 'LoginError';
    this.status = status;
    this.code = code;
  }
}

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
  if (response.ok) return true;
  const body = await response.json().catch(() => ({}));
  throw new LoginError(response.status, body?.error);
}

export async function logout() {
  inventoryVersion = null;
  await jsonRequest('/api/logout', { method: 'POST' });
}

export async function loadFromCloud() {
  const response = await jsonRequest('/api/inventory');
  if (!response.ok) return null;
  const body = await response.json();
  inventoryVersion = body?.versionToken || null;
  return body?.data || null;
}

export async function saveToCloud(payload) {
  if (!inventoryVersion) return { ok: false, conflict: true };
  const response = await jsonRequest('/api/inventory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Inventory-Version': inventoryVersion },
    body: JSON.stringify(payload)
  });
  if (response.status === 412) return { ok: false, conflict: true };
  if (!response.ok) return { ok: false, conflict: false };
  const body = await response.json();
  inventoryVersion = body?.versionToken || null;
  return { ok: true, conflict: false };
}
