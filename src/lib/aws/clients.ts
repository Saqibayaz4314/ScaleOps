import "server-only";
import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { EC2Client } from "@aws-sdk/client-ec2";
import { ElasticLoadBalancingV2Client } from "@aws-sdk/client-elastic-load-balancing-v2";
import { STSClient } from "@aws-sdk/client-sts";
import type { AwsContext, AwsCredentials } from "./context";

/** Per-request hard cap for any single AWS call (TRD: ~6s). */
export const AWS_CALL_TIMEOUT_MS = 6000;

export function callOptions() {
  return { abortSignal: AbortSignal.timeout(AWS_CALL_TIMEOUT_MS) };
}

export interface Clients {
  asg: AutoScalingClient;
  ec2: EC2Client;
  elb: ElasticLoadBalancingV2Client;
  cw: CloudWatchClient;
}

// Credentials differ per user, so clients are never shared across users: they live only as long
// as the context object of a single request.
const perContext = new WeakMap<AwsContext, Clients>();

export function clientsFor(ctx: AwsContext): Clients {
  let c = perContext.get(ctx);
  if (!c) {
    const cfg = { region: ctx.region, credentials: ctx.credentials, maxAttempts: 2 };
    c = {
      asg: new AutoScalingClient(cfg),
      ec2: new EC2Client(cfg),
      elb: new ElasticLoadBalancingV2Client(cfg),
      cw: new CloudWatchClient(cfg),
    };
    perContext.set(ctx, c);
  }
  return c;
}

export function adhocClients(region: string, credentials: AwsCredentials) {
  const cfg = { region, credentials, maxAttempts: 2 };
  return {
    sts: new STSClient(cfg),
    asg: new AutoScalingClient(cfg),
    elb: new ElasticLoadBalancingV2Client(cfg),
  };
}
