import { authenticateWithAws, internalError, json } from "@/lib/api/guard";
import { getInfrastructure } from "@/lib/aws/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const a = await authenticateWithAws();
    if (!a.ok) return a.res;
    const { httpStatus, body } = await getInfrastructure(a.ctx);
    return json(body, httpStatus);
  } catch {
    return internalError();
  }
}
