import "server-only";
import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import { DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { identityFailure, normalizeAwsError } from "@/lib/errors/aws-errors";
import type { PanelError } from "@/types/api";
import { describeGroup, getScalingEvents } from "./asg";
import { adhocClients, callOptions } from "./clients";
import type { AwsContext, AwsCredentials } from "./context";
import { getMetrics } from "./cloudwatch";
import { getEc2Details } from "./ec2";
import { getTargetHealth } from "./elbv2";

export interface Identity {
  accountId: string;
  arn: string;
}

export const isRootArn = (arn: string) => /:root$/.test(arn);

export async function getIdentity(region: string, creds: AwsCredentials): Promise<Identity> {
  const out = await adhocClients(region, creds).sts.send(new GetCallerIdentityCommand({}), callOptions()).catch((error: unknown) => {
    const failure = identityFailure(error);
    console.warn("AWS identity verification failed", { reason: failure.reason, code: failure.code });
    throw error;
  });
  if (!out.Account || !out.Arn) throw new Error("STS returned no identity");
  return { accountId: out.Account, arn: out.Arn };
}

export interface DiscoveredGroup {
  name: string;
  min: number;
  max: number;
  desired: number;
  instanceCount: number;
  targetGroups: { arn: string; name: string; albArns: string[] }[];
}

/** Lists the account's Auto Scaling groups (read-only) with their ALB target groups. */
export async function discoverGroups(region: string, creds: AwsCredentials): Promise<DiscoveredGroup[]> {
  const { asg, elb } = adhocClients(region, creds);
  const groups: DiscoveredGroup[] = [];
  const tgArns = new Set<string>();
  const raw: { name: string; min: number; max: number; desired: number; n: number; tgs: string[] }[] = [];
  let token: string | undefined;
  for (let page = 0; page < 5; page++) {
    const out = await asg.send(new DescribeAutoScalingGroupsCommand({ NextToken: token, MaxRecords: 100 }), callOptions());
    for (const g of out.AutoScalingGroups ?? []) {
      if (!g.AutoScalingGroupName) continue;
      for (const a of g.TargetGroupARNs ?? []) tgArns.add(a);
      raw.push({
        name: g.AutoScalingGroupName,
        min: g.MinSize ?? 0,
        max: g.MaxSize ?? 0,
        desired: g.DesiredCapacity ?? 0,
        n: g.Instances?.length ?? 0,
        tgs: g.TargetGroupARNs ?? [],
      });
    }
    token = out.NextToken;
    if (!token) break;
  }
  const tgInfo = new Map<string, { name: string; albArns: string[] }>();
  const all = [...tgArns];
  for (let i = 0; i < all.length; i += 20) {
    const out = await elb.send(new DescribeTargetGroupsCommand({ TargetGroupArns: all.slice(i, i + 20) }), callOptions());
    for (const t of out.TargetGroups ?? []) {
      if (t.TargetGroupArn) {
        tgInfo.set(t.TargetGroupArn, {
          name: t.TargetGroupName ?? "",
          albArns: (t.LoadBalancerArns ?? []).filter((a) => a.includes(":loadbalancer/app/")),
        });
      }
    }
  }
  for (const g of raw) {
    groups.push({
      name: g.name,
      min: g.min,
      max: g.max,
      desired: g.desired,
      instanceCount: g.n,
      targetGroups: g.tgs.flatMap((arn) => {
        const t = tgInfo.get(arn);
        return t ? [{ arn, name: t.name, albArns: t.albArns }] : [];
      }),
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export interface Check {
  name: string;
  ok: boolean;
  error: PanelError | null;
}

/** Exercises every read API the dashboard uses, so permission gaps show up at connect time. */
export async function runChecks(ctx: AwsContext): Promise<Check[]> {
  const run = async (name: string, source: PanelError["source"], fn: () => Promise<unknown>): Promise<Check> => {
    try {
      await fn();
      return { name, ok: true, error: null };
    } catch (e) {
      return { name, ok: false, error: normalizeAwsError(e, source) };
    }
  };
  const group = await describeGroup(ctx).then(
    (g) => ({ ok: true as const, g }),
    (e) => ({ ok: false as const, e }),
  );
  const ids = group.ok ? (group.g.Instances ?? []).flatMap((i) => (i.InstanceId ? [i.InstanceId] : [])) : [];
  const groupCheck: Check = group.ok
    ? { name: "Auto Scaling group (DescribeAutoScalingGroups)", ok: true, error: null }
    : { name: "Auto Scaling group (DescribeAutoScalingGroups)", ok: false, error: normalizeAwsError(group.e, "autoscaling") };
  const rest = await Promise.all([
    run("Scaling activities (DescribeScalingActivities)", "autoscaling", () => getScalingEvents(ctx, 1)),
    run("Target health (DescribeTargetHealth)", "elbv2", () => getTargetHealth(ctx)),
    run("CloudWatch metrics (GetMetricData)", "cloudwatch", () => getMetrics(ctx, "1h", ids)),
    run("EC2 instances (DescribeInstances)", "ec2", () => getEc2Details(ctx, ids)),
  ]);
  return [groupCheck, ...rest];
}
