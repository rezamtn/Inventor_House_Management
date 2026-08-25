import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const password = crypto.randomBytes(18).toString('base64url');
const salt = crypto.randomBytes(16);
const derived = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

console.log(`LOGIN_PASSWORD=${password}`);
console.log(`APP_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${derived.toString('hex')}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`);
