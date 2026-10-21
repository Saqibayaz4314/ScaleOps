// Usage: node scripts/gen-keys.mjs  -> prints a fresh ENCRYPTION_KEY (32 random bytes, base64)
import { randomBytes } from "node:crypto";
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
