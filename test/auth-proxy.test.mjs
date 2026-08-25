import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import inventoryHandler from '../api/inventory.js';
import loginHandler from '../api/login.js';
import sessionHandler from '../api/session.js';

const password = 'correct-horse-battery-staple';
const salt = Buffer.alloc(16, 7);
const derived = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
process.env.APP_ORIGIN = 'https://inventor-house-management.vercel.app';
process.env.APP_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.INVENTORY_API_URL = 'https://inventory-api.example.test';
process.env.INVENTORY_API_TOKEN = 'b'.repeat(64);

function responseMock() {
  return {
    body: undefined,
    headers: new Map(),
    statusCode: 200,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end() { return this; }
  };
}

function request(method, overrides = {}) {
  return {
    method,
    body: overrides.body,
    headers: { origin: process.env.APP_ORIGIN, ...(overrides.headers || {}) },
    socket: { remoteAddress: '127.0.0.1' }
  };
}

async function authenticatedCookie() {
  const res = responseMock();
  await loginHandler(request('POST', { body: { password } }), res);
  assert.equal(res.statusCode, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('login rejects an untrusted origin', async () => {
  const res = responseMock();
  await loginHandler(request('POST', { body: { password }, headers: { origin: 'https://evil.example' } }), res);
  assert.equal(res.statusCode, 403);
});

test('login creates a secure session recognized by the session endpoint', async () => {
  const cookie = await authenticatedCookie();
  const res = responseMock();
  await sessionHandler(request('GET', { headers: { cookie } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { authenticated: true });
  assert.match(cookie, /^inventory_session=/);
});

test('inventory rejects requests without a session', async () => {
  const res = responseMock();
  await inventoryHandler(request('GET'), res);
  assert.equal(res.statusCode, 401);
});

test('inventory proxy keeps the API token server-side and forwards the version token', async () => {
  const cookie = await authenticatedCookie();
  let receivedAuthorization;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    receivedAuthorization = options.headers.get('Authorization');
    return new Response(JSON.stringify({ id: 'main', data: { version: 5, houses: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ETag: 'W/"version-1"' }
    });
  };
  try {
    const res = responseMock();
    await inventoryHandler(request('GET', { headers: { cookie } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).versionToken, '"version-1"');
    assert.equal(receivedAuthorization, `Bearer ${process.env.INVENTORY_API_TOKEN}`);
    assert.doesNotMatch(String(res.body), new RegExp(process.env.INVENTORY_API_TOKEN));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inventory proxy preserves a stale-write 412 response', async () => {
  const cookie = await authenticatedCookie();
  const originalFetch = globalThis.fetch;
  let receivedIfMatch;
  globalThis.fetch = async (_url, options) => {
    receivedIfMatch = options.headers.get('If-Match');
    return new Response(JSON.stringify({ error: 'inventory_changed' }), {
      status: 412,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const res = responseMock();
    await inventoryHandler(request('PUT', {
      body: { version: 5, houses: [] },
      headers: { cookie, 'x-inventory-version': 'W/"old-version"' }
    }), res);
    assert.equal(res.statusCode, 412);
    assert.equal(receivedIfMatch, '"old-version"');
    assert.match(String(res.body), /inventory_changed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
