import "server-only";
import {
  DescribeAutoScalingGroupsCommand,
  DescribeScalingActivitiesCommand,
  type AutoScalingGroup,
} from "@aws-sdk/client-auto-scaling";
import { ResourceMissingError } from "@/lib/errors/aws-errors";
import { mapActivity, sortEventsDesc } from "@/lib/data/normalize";
import type { ScalingEvent } from "@/types/api";
import type { AwsContext } from "./context";
import { callOptions, clientsFor } from "./clients";

export async function describeGroup(ctx: AwsContext): Promise<AutoScalingGroup> {
  const out = await clientsFor(ctx).asg.send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ctx.asgName] }),
    callOptions(),
  );
  const group = out.AutoScalingGroups?.[0];
  if (!group) {
    throw new ResourceMissingError("Auto Scaling group not found in this region");
  }
  return group;
}

export async function getScalingEvents(ctx: AwsContext, limit: number): Promise<ScalingEvent[]> {
  const out = await clientsFor(ctx).asg.send(
    new DescribeScalingActivitiesCommand({
      AutoScalingGroupName: ctx.asgName,
      MaxRecords: Math.min(Math.max(limit, 1), 100),
    }),
    callOptions(),
  );
  return sortEventsDesc((out.Activities ?? []).map(mapActivity)).slice(0, limit);
}
