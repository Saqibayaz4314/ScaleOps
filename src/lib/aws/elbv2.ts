import "server-only";
import { DescribeTargetHealthCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { summarizeTargets } from "@/lib/data/normalize";
import type { TargetSummary } from "@/types/api";
import type { AwsContext } from "./context";
import { callOptions, clientsFor } from "./clients";

export async function getTargetHealth(ctx: AwsContext): Promise<TargetSummary> {
  const out = await clientsFor(ctx).elb.send(
    new DescribeTargetHealthCommand({ TargetGroupArn: ctx.targetGroupArn }),
    callOptions(),
  );
  return summarizeTargets(out.TargetHealthDescriptions ?? []);
}
