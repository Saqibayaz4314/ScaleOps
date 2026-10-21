import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Self-describing format so parameters can be raised later: scrypt$N$r$p$saltHex$hashHex
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, len: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, len, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashHex, "hex");
  if (!expected.length || !/^[0-9a-f]+$/i.test(saltHex)) return false;
  const actual = await derive(password, Buffer.from(saltHex, "hex"), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Pre-computed hash used to burn equal time when the email is unknown (no user enumeration). */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword("scaleops-dummy-password"));
}
