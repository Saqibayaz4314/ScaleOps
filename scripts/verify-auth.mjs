// Uses a disposable account, then deletes only that account. Never prints credentials/cookies.
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.APP_URL || 'http://127.0.0.1:3001';
const email = `auth-check-${randomUUID()}@example.com`;
const password = randomBytes(24).toString('base64url');
const name = 'Signup Verification';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
url.searchParams.delete('ssl');
const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
const mode = process.env.DATABASE_SSL || (local ? 'disable' : 'require');
const client = new pg.Client({ connectionString: url.toString(), ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'require' }, connectionTimeoutMillis: 30000 });
await client.connect();
const headers = { 'content-type': 'application/json', origin: base, 'x-forwarded-for': '127.0.0.230' };
async function post(route, data, cookie) {
  return fetch(`${base}/api/auth/${route}`, { method: 'POST', headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(data), signal: AbortSignal.timeout(30000) });
}
try {
  const anonymous = await fetch(`${base}/api/overview`, { signal: AbortSignal.timeout(15000) });
  assert.equal(anonymous.status, 401, 'Unauthenticated overview must be blocked');
  const crossOrigin = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { ...headers, origin: 'https://untrusted.example' }, body: '{}', signal: AbortSignal.timeout(15000) });
  assert.equal(crossOrigin.status, 403, 'Cross-origin signup must be blocked');
  const signup = await post('signup', { name, email, password, ...(process.env.SIGNUP_INVITE_CODE ? { inviteCode: process.env.SIGNUP_INVITE_CODE } : {}) });
  assert.equal(signup.status, 200, `Signup failed: ${signup.status} ${JSON.stringify(await signup.json())}`);
  const cookie = signup.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Signup did not set a session');
  if (process.env.EXPECT_SECURE_COOKIE === 'true') assert.match(signup.headers.get('set-cookie'), /;\s*Secure/i, 'Production cookie must be Secure');
  const saved = await client.query('SELECT name FROM users WHERE email=$1', [email]);
  assert.equal(saved.rows[0]?.name, name);
  for (const page of ['/dashboard', '/infrastructure', '/scaling-events']) {
    const navigation = await fetch(`${base}${page}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert.equal(navigation.status, 200, `${page} must not redirect back to AWS connection setup`);
  }
  const missingAws = await fetch(`${base}/api/overview`, { headers: { cookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(missingAws.status, 409, 'Missing AWS setup must remain an explicit API state');
  const connected = await fetch(`${base}/api/connection`, { headers: { cookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(connected.status, 200, 'Signup session did not authenticate');
  assert.equal((await post('logout', {}, cookie)).status, 200);
  const expired = await fetch(`${base}/api/connection`, { headers: { cookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(expired.status, 401, 'Logout did not revoke the session');
  assert.equal((await post('login', { email, password })).status, 200, 'Login failed');
  console.log('PASS: API protection, signup/name, navigation without connection redirects, missing-AWS state, authenticated session, logout and login.');
} finally {
  await client.query('DELETE FROM users WHERE email=$1', [email]);
  await client.end();
  console.log('Disposable verification account removed.');
}
