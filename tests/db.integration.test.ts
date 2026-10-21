// Runs against a real PostgreSQL. Skipped unless TEST_DATABASE_URL is set (migrations must be applied).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("database layer (real PostgreSQL)", () => {
  const creds = { accessKeyId: "AKIAABCDEFGHIJKLMNOP", secretAccessKey: "Zz9/+".repeat(8) };
  const input = {
    region: "ap-south-1",
    asgName: "asg-1",
    albArn: "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/a/b",
    targetGroupArn: "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/t/c",
  };
  const id = { accountId: "123456789012", arn: "arn:aws:iam::123456789012:user/dash" };
  let users: typeof import("@/lib/db/users");
  let conns: typeof import("@/lib/db/connections");
  let sessions: typeof import("@/lib/auth/session");
  let rl: typeof import("@/lib/auth/rate-limit");
  let pool: typeof import("@/lib/db/pool");
  let a: { id: string }, b: { id: string };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    users = await import("@/lib/db/users");
    conns = await import("@/lib/db/connections");
    sessions = await import("@/lib/auth/session");
    rl = await import("@/lib/auth/rate-limit");
    pool = await import("@/lib/db/pool");
    const s = randomBytes(4).toString("hex");
    a = (await users.createUser(`a-${s}@example.com`, "hash", "Account A"))!;
    b = (await users.createUser(`b-${s}@example.com`, "hash"))!;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[a.id, b.id]]);
    await pool.getPool().end();
  });

  it("rejects duplicate emails case-insensitively", async () => {
    expect((await pool.query("SELECT name FROM users WHERE id=$1", [a.id])).rows[0]?.name).toBe("Account A");
    const u = await users.findUserByEmail("A-x@EXAMPLE.com");
    expect(u).toBeNull();
    const dup = await users.createUser(`${(await pool.query("SELECT email FROM users WHERE id=$1", [a.id])).rows[0]!.email.toUpperCase()}`, "h");
    expect(dup).toBeNull();
  });

  it("stores credentials encrypted, never in plaintext", async () => {
    expect(await conns.hasConnection(a.id)).toBe(false);
    await conns.saveConnection(a.id, input, creds, id);
    expect(await conns.hasConnection(a.id)).toBe(true);
    expect(await conns.hasConnection(b.id)).toBe(false);
    const raw = (await pool.query("SELECT * FROM aws_connections WHERE user_id=$1", [a.id])).rows[0]!;
    expect(JSON.stringify(raw)).not.toContain(creds.secretAccessKey);
    expect(JSON.stringify(raw)).not.toContain(creds.accessKeyId);
    expect(raw.key_hint).toBe("MNOP");
    const ctx = await conns.loadAwsContext(a.id);
    expect(ctx?.credentials).toEqual(creds);
  });

  it("isolates users: B cannot read A's connection; blob swap fails", async () => {
    expect(await conns.loadAwsContext(b.id)).toBeNull();
    expect(await conns.getConnectionMeta(b.id)).toBeNull();
    const blob = (await pool.query("SELECT credentials_enc FROM aws_connections WHERE user_id=$1", [a.id])).rows[0]!.credentials_enc;
    await pool.query(
      `INSERT INTO aws_connections (user_id, region, asg_name, alb_arn, target_group_arn, credentials_enc, key_hint)
       VALUES ($1,'ap-south-1','x',$2,$3,$4,'0000')`,
      [b.id, input.albArn, input.targetGroupArn, blob],
    );
    await expect(conns.loadAwsContext(b.id)).rejects.toThrow(); // AAD is bound to the owner
  });

  it("enforces one connection per user (upsert replaces)", async () => {
    await conns.saveConnection(a.id, { ...input, asgName: "asg-2" }, creds, id);
    const n = (await pool.query("SELECT count(*)::int AS n FROM aws_connections WHERE user_id=$1", [a.id])).rows[0]!.n;
    expect(n).toBe(1);
    expect((await conns.getConnectionMeta(a.id))?.asgName).toBe("asg-2");
  });

  it("delete removes the connection", async () => {
    expect(await conns.deleteConnection(a.id)).toBe(true);
    expect(await conns.hasConnection(a.id)).toBe(false);
  });

  it("sessions: store only a hash, resolve, expire, revoke", async () => {
    const token = await sessions.createSession(a.id, "vitest");
    const stored = (await pool.query("SELECT encode(token_hash,'hex') h FROM sessions WHERE user_id=$1", [a.id])).rows.map((r) => r.h);
    expect(stored.join()).not.toContain(token);
    expect((await sessions.userForToken(token))?.id).toBe(a.id);
    expect(await sessions.userForToken("not-a-token")).toBeNull();
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id=$1", [a.id]);
    expect(await sessions.userForToken(token)).toBeNull();
    const t2 = await sessions.createSession(a.id, null);
    await sessions.destroyToken(t2);
    expect(await sessions.userForToken(t2)).toBeNull();
  });

  it("rate limit blocks after the limit, shared via the database", async () => {
    const key = `test:${randomBytes(4).toString("hex")}`;
    const results = [] as boolean[];
    for (let i = 0; i < 5; i++) results.push(await rl.rateLimit(key, 3, 60));
    expect(results).toEqual([true, true, true, false, false]);
    await pool.query("DELETE FROM rate_limits WHERE key=$1", [key]);
  });

  it("deleting a user cascades to sessions and connections", async () => {
    const s = randomBytes(4).toString("hex");
    const u = (await users.createUser(`c-${s}@example.com`, "h"))!;
    await conns.saveConnection(u.id, input, creds, id);
    await sessions.createSession(u.id, null);
    await pool.query("DELETE FROM users WHERE id=$1", [u.id]);
    const left = (await pool.query("SELECT (SELECT count(*) FROM sessions WHERE user_id=$1)+(SELECT count(*) FROM aws_connections WHERE user_id=$1) n", [u.id])).rows[0]!.n;
    expect(Number(left)).toBe(0);
  });
});
