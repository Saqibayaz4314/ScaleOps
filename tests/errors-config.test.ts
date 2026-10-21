import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classify, normalizeAwsError } from "@/lib/errors/aws-errors";
import { loadServerEnv } from "@/lib/env";
import { decryptSecret, encryptSecret, type Keyring } from "@/lib/crypto/secrets";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { connectSchema, discoverSchema } from "@/lib/aws/validation";
import { isRootArn } from "@/lib/aws/connect";

describe("normalizeAwsError", () => {
  it("classifies without leaking SDK messages", () => {
    const denied = Object.assign(new Error("User: arn:aws:iam::123456789012:user/x is not authorized"), { name: "AccessDenied" });
    const p = normalizeAwsError(denied, "cloudwatch");
    expect(p.code).toBe("AWS_ACCESS_DENIED");
    expect(p.message).not.toContain("123456789012");
  });
  it("maps throttling, timeout, network, missing", () => {
    expect(classify(Object.assign(new Error("x"), { name: "Throttling" }))).toBe("AWS_THROTTLED");
    expect(classify(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("AWS_TIMEOUT");
    expect(classify(Object.assign(new Error("x"), { name: "LoadBalancerNotFound" }))).toBe("AWS_RESOURCE_MISSING");
    expect(classify(new Error("boom"))).toBe("AWS_UNAVAILABLE");
    expect(classify(Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }))).toBe("AWS_UNAVAILABLE");
    expect(classify(Object.assign(new Error("x"), { name: "ValidationError" }))).toBe("AWS_UNAVAILABLE");
  });
});

describe("server env", () => {
  const key = randomBytes(32).toString("base64");
  it("accepts a valid env", () => {
    expect(loadServerEnv({ DATABASE_URL: "postgres://x", ENCRYPTION_KEY: key } as unknown as NodeJS.ProcessEnv).ok).toBe(true);
  });
  it("reports names, never values", () => {
    const r = loadServerEnv({ ENCRYPTION_KEY: "short" } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid.sort()).toEqual(["DATABASE_URL", "ENCRYPTION_KEY"]);
  });
  it("signup enabled by default, off only when 'false'", () => {
    const base = { DATABASE_URL: "x", ENCRYPTION_KEY: key };
    const a = loadServerEnv(base as unknown as NodeJS.ProcessEnv);
    const b = loadServerEnv({ ...base, SIGNUP_ENABLED: "false" } as unknown as NodeJS.ProcessEnv);
    expect(a.ok && a.env.SIGNUP_ENABLED).toBe(true);
    expect(b.ok && b.env.SIGNUP_ENABLED).toBe(false);
  });
});

describe("secret encryption (AES-256-GCM)", () => {
  const ring: Keyring = { current: randomBytes(32) };
  it("round-trips and never contains the plaintext", () => {
    const blob = encryptSecret("super-secret-value", "user-1", ring);
    expect(blob).not.toContain("super-secret");
    expect(decryptSecret(blob, "user-1", ring)).toBe("super-secret-value");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("a", "u", ring)).not.toBe(encryptSecret("a", "u", ring));
  });
  it("fails for another user's AAD (blob swapping), tampering, wrong key", () => {
    const blob = encryptSecret("s", "user-1", ring);
    expect(() => decryptSecret(blob, "user-2", ring)).toThrow();
    const parts = blob.split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "user-1", ring)).toThrow();
    expect(() => decryptSecret(blob, "user-1", { current: randomBytes(32) })).toThrow();
  });
  it("supports key rotation via previous key", () => {
    const old: Keyring = { current: randomBytes(32) };
    const blob = encryptSecret("s", "u", old);
    const rotated: Keyring = { current: randomBytes(32), previous: old.current };
    expect(decryptSecret(blob, "u", rotated)).toBe("s");
  });
});

describe("password hashing", () => {
  it("verifies and rejects", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("connection validation", () => {
  const good = {
    accessKeyId: "AKIAABCDEFGHIJKLMNOP",
    secretAccessKey: "a".repeat(40),
    region: "ap-south-1",
    asgName: "my-asg",
    albArn: "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/a/b",
    targetGroupArn: "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/t/c",
  };
  it("accepts valid input", () => expect(connectSchema.safeParse(good).success).toBe(true));
  it("rejects temporary (ASIA) keys, bad secrets, unknown fields", () => {
    expect(connectSchema.safeParse({ ...good, accessKeyId: "ASIAABCDEFGHIJKLMNOP" }).success).toBe(false);
    expect(connectSchema.safeParse({ ...good, secretAccessKey: "short" }).success).toBe(false);
    expect(connectSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(discoverSchema.safeParse({ accessKeyId: good.accessKeyId, secretAccessKey: good.secretAccessKey, region: "nope" }).success).toBe(false);
  });
  it("detects root identities", () => {
    expect(isRootArn("arn:aws:iam::123456789012:root")).toBe(true);
    expect(isRootArn("arn:aws:iam::123456789012:user/dashboard")).toBe(false);
  });
});

import { buildPoolConfig } from "@/lib/db/config";

describe("database TLS config", () => {
  it("local host: no TLS by default", () => {
    expect(buildPoolConfig("postgres://u:p@localhost:5432/db").ssl).toBe(false);
  });
  it("remote host: verified TLS by default", () => {
    expect(buildPoolConfig("postgres://u:p@db.example.com/db").ssl).toEqual({ rejectUnauthorized: true });
  });
  it("Heroku: no-verify keeps TLS but accepts the self-signed chain", () => {
    const c = buildPoolConfig("postgres://u:p@ec2-1-2-3-4.compute-1.amazonaws.com:5432/d123", "no-verify");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
  });
  it("strips sslmode from the URL so it cannot override the option", () => {
    const c = buildPoolConfig("postgres://u:p@db.example.com/db?sslmode=require&application_name=x", "no-verify");
    expect(c.connectionString).not.toContain("sslmode");
    expect(c.connectionString).toContain("application_name=x");
  });
  it("accepts DATABASE_SSL via env schema", () => {
    const key = randomBytes(32).toString("base64");
    const ok = loadServerEnv({ DATABASE_URL: "x", ENCRYPTION_KEY: key, DATABASE_SSL: "no-verify" } as unknown as NodeJS.ProcessEnv);
    const bad = loadServerEnv({ DATABASE_URL: "x", ENCRYPTION_KEY: key, DATABASE_SSL: "maybe" } as unknown as NodeJS.ProcessEnv);
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
  });
});
