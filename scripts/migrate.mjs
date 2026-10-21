// Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs
// Applies db/migrations/*.sql in filename order, each in its own transaction.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
// Same TLS rules as src/lib/db/config.ts (DATABASE_SSL = disable | require | no-verify).
const u = new URL(url);
u.searchParams.delete("sslmode");
u.searchParams.delete("ssl");
const local = ["localhost", "127.0.0.1", "::1", ""].includes(u.hostname);
const mode = process.env.DATABASE_SSL || (local ? "disable" : "require");
const client = new pg.Client({
  connectionString: u.toString(),
  ssl: mode === "disable" ? false : { rejectUnauthorized: mode === "require" },
});
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log(`applied ${f}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`FAILED ${f}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log("migrations up to date");
} finally {
  await client.end();
}
