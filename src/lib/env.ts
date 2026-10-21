import "server-only";
import { z } from "zod";

export interface AwsConfig {
  region: string;
  asgName: string;
  albArn: string;
  targetGroupArn: string;
}

const bool = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v !== "false");

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.enum(["disable", "require", "no-verify"]).optional(),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 encoded"),
  ENCRYPTION_KEY_PREVIOUS: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 encoded")
    .optional(),
  SIGNUP_ENABLED: bool,
  SIGNUP_INVITE_CODE: z.string().min(8).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

export type EnvResult = { ok: true; env: ServerEnv } | { ok: false; invalid: string[] };

/** Reports variable NAMES only — never values. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): EnvResult {
  const parsed = schema.safeParse({
    DATABASE_URL: source.DATABASE_URL || undefined,
    DATABASE_SSL: source.DATABASE_SSL || undefined,
    ENCRYPTION_KEY: source.ENCRYPTION_KEY || undefined,
    ENCRYPTION_KEY_PREVIOUS: source.ENCRYPTION_KEY_PREVIOUS || undefined,
    SIGNUP_ENABLED: source.SIGNUP_ENABLED || undefined,
    SIGNUP_INVITE_CODE: source.SIGNUP_INVITE_CODE || undefined,
  });
  if (!parsed.success) {
    return { ok: false, invalid: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  }
  return { ok: true, env: parsed.data };
}

export function requireServerEnv(): ServerEnv {
  const r = loadServerEnv();
  if (!r.ok) throw new Error(`Server misconfigured: ${r.invalid.join(", ")}`);
  return r.env;
}
