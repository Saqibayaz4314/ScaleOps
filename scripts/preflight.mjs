// Read-only deployment check. Never print connection strings or encryption keys.
import { readdir } from 'node:fs/promises';
import pg from 'pg';

const missing = ['DATABASE_URL', 'ENCRYPTION_KEY'].filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing settings: ${missing.join(', ')}`);
if (Buffer.from(process.env.ENCRYPTION_KEY, 'base64').length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes.');
let url;
try { url = new URL(process.env.DATABASE_URL); } catch { throw new Error('DATABASE_URL is not a valid URL.'); }
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be PostgreSQL.');
url.searchParams.delete('sslmode');
url.searchParams.delete('ssl');
const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
const mode = process.env.DATABASE_SSL || (local ? 'disable' : 'require');
if (!['disable', 'require', 'no-verify'].includes(mode)) throw new Error('Invalid DATABASE_SSL.');
const client = new pg.Client({ connectionString: url.toString(), ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'require' }, connectionTimeoutMillis: 30000, statement_timeout: 10000 });
try {
  await client.connect();
  const expected = (await readdir(new URL('../db/migrations/', import.meta.url))).filter(file => file.endsWith('.sql'));
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map(row => row.name));
  const pending = expected.filter(name => !applied.has(name));
  if (pending.length) throw new Error(`Run npm run db:migrate. Pending: ${pending.join(', ')}`);
  await client.query('SELECT name, email, password_hash FROM users LIMIT 0');
  const connections = await client.query('SELECT count(*)::int AS count FROM aws_connections');
  console.log(`PASS: environment, database connection and all ${expected.length} migrations.`);
  console.log(`Saved AWS connections: ${connections.rows[0].count}. Live telemetry and scale-out still require separate verification.`);
} catch (error) {
  // Avoid raw connection/authentication errors containing infrastructure identifiers.
  console.error(error.message?.startsWith('Run npm run db:migrate.') ? error.message : 'Preflight failed: database unreachable, invalid TLS/configuration, or schema unavailable.');
  process.exitCode = 1;
} finally {
  await client.end();
}
