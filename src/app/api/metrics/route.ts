import { authenticateWithAws, badRequest, internalError, json, parseRange } from "@/lib/api/guard";
import { getMetricsOnly } from "@/lib/aws/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const a = await authenticateWithAws();
    if (!a.ok) return a.res;
    const range = parseRange(new URL(req.url).searchParams.get("range"));
    if (!range) return badRequest("range must be one of 1h, 3h, 6h");
    const { httpStatus, body } = await getMetricsOnly(a.ctx, range);
    return json(body, httpStatus);
  } catch {
    return internalError();
  }
}
