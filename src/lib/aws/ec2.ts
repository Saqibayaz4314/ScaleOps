import "server-only";
import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { AwsContext } from "./context";
import { callOptions, clientsFor } from "./clients";

export interface Ec2Detail {
  state: string | null;
  instanceType: string | null;
  availabilityZone: string | null;
  launchTime: string | null;
}

/** Only the ASG's own instance IDs are queried; never an account-wide listing. */
export async function getEc2Details(
  ctx: AwsContext,
  instanceIds: string[],
): Promise<Map<string, Ec2Detail>> {
  const map = new Map<string, Ec2Detail>();
  if (instanceIds.length === 0) return map;
  const out = await clientsFor(ctx).ec2.send(
    new DescribeInstancesCommand({ InstanceIds: instanceIds.slice(0, 100) }),
    callOptions(),
  );
  for (const r of out.Reservations ?? []) {
    for (const i of r.Instances ?? []) {
      if (!i.InstanceId) continue;
      map.set(i.InstanceId, {
        state: i.State?.Name ?? null,
        instanceType: i.InstanceType ?? null,
        availabilityZone: i.Placement?.AvailabilityZone ?? null,
        launchTime: i.LaunchTime ? i.LaunchTime.toISOString() : null,
      });
    }
  }
  return map;
}
