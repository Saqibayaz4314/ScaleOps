import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAwsContext } from "@/lib/db/connections";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import type { AwsContext } from "@/lib/aws/context";
import type { ApiErrorBody, AwsErrorCode, RangeKey } from "@/types/api";
import { messageFor } from "@/lib/errors/aws-errors";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function apiError(status: number, code: AwsErrorCode | "UNAUTHENTICATED" | "BAD_REQUEST" | "RATE_LIMITED" | "FORBIDDEN" | "SERVER_ERROR", message: string) {
  return json({ status: "error", code, message }, status);
}

function errorBody(code: AwsErrorCode): ApiErrorBody {
  return {
    status: "error",
    source: "scaleops",
    fetchedAt: new Date().toISOString(),
    errors: [{ source: "autoscaling", code, message: messageFor(code) }],
  };
}

export function internalError() {
  return apiError(500, "SERVER_ERROR", "Unexpected server error.");
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0]!.trim();
}

/** CSRF defence for state-changing routes (in addition to SameSite=Lax cookies). */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    return req.headers.get("sec-fetch-site") === "cross-site" ? apiError(403, "FORBIDDEN", "Cross-site request blocked.") : null;
  }
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return apiError(403, "FORBIDDEN", "Cross-site request blocked.");
  }
  const allowed = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(Boolean);
  return allowed.includes(host) ? null : apiError(403, "FORBIDDEN", "Cross-site request blocked.");
}

export type Authed = { ok: true; user: SessionUser } | { ok: false; res: NextResponse };

/** Auth gate: MUST run before any AWS client is created or any AWS call is made. */
export async function authenticate(): Promise<Authed> {
  const user = await getSessionUser();
  if (!user) return { ok: false, res: apiError(401, "UNAUTHENTICATED", "Authentication required") };
  return { ok: true, user };
}

export type WithContext = { ok: true; user: SessionUser; ctx: AwsContext } | { ok: false; res: NextResponse };

export async function authenticateWithAws(): Promise<WithContext> {
  const a = await authenticate();
  if (!a.ok) return a;
  const ctx = await loadAwsContext(a.user.id);
  if (!ctx) return { ok: false, res: json(errorBody("NOT_CONNECTED"), 409) };
  return { ok: true, user: a.user, ctx };
}

const rangeSchema = z.enum(["1h", "3h", "6h"]);
export function parseRange(value: string | null): RangeKey | null {
  const r = rangeSchema.safeParse(value ?? "1h");
  return r.success ? r.data : null;
}

const limitSchema = z.coerce.number().int().min(1).max(50);
export function parseLimit(value: string | null): number | null {
  const r = limitSchema.safeParse(value ?? "20");
  return r.success ? r.data : null;
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 10_000) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function badRequest(message: string) {
  return apiError(400, "BAD_REQUEST", message);
}
