import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 * - keyId = first 4 bytes of SHA-256(key): lets us pick the right key during rotation.
 * - AAD binds the blob to its owner (user id), so a blob copied to another row fails to decrypt.
 */
export interface Keyring {
  current: Buffer;
  previous?: Buffer;
}

const fp = (key: Buffer) => createHash("sha256").update(key).digest().subarray(0, 4).toString("hex");
const b64 = (b: Buffer) => b.toString("base64url");

export function encryptSecret(plaintext: string, aad: string, ring: Keyring): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.current, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", fp(ring.current), b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

export function decryptSecret(blob: string, aad: string, ring: Keyring): string {
  const parts = blob.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unsupported secret format");
  const [, keyId, iv, tag, ct] = parts as [string, string, string, string, string];
  const key = [ring.current, ring.previous].find((k) => k && fp(k) === keyId);
  if (!key) throw new Error("No matching encryption key (was ENCRYPTION_KEY rotated without ENCRYPTION_KEY_PREVIOUS?)");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export function keyringFromEnv(env: { ENCRYPTION_KEY: string; ENCRYPTION_KEY_PREVIOUS?: string }): Keyring {
  return {
    current: Buffer.from(env.ENCRYPTION_KEY, "base64"),
    previous: env.ENCRYPTION_KEY_PREVIOUS ? Buffer.from(env.ENCRYPTION_KEY_PREVIOUS, "base64") : undefined,
  };
}
