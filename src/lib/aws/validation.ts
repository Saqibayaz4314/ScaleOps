import { z } from "zod";

// Long-term IAM *user* access keys only (AKIA...). ASIA... keys are temporary and expire, which
// would silently break the dashboard; root keys are rejected after the STS identity check.
export const credentialsSchema = z.object({
  accessKeyId: z.string().trim().regex(/^AKIA[A-Z0-9]{16}$/, "Must be an IAM user access key id (starts with AKIA, 20 characters)"),
  secretAccessKey: z.string().trim().regex(/^[A-Za-z0-9/+=]{40}$/, "Secret access key must be 40 characters"),
});

export const regionSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "Must look like ap-south-1");

export const discoverSchema = credentialsSchema.extend({ region: regionSchema }).strict();

const arn = (resource: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^arn:aws[a-z-]*:elasticloadbalancing:[a-z0-9-]+:\\d{12}:${resource}/.+`), `Must be a valid ${resource} ARN`);

export const connectSchema = credentialsSchema
  .extend({
    region: regionSchema,
    asgName: z.string().trim().min(1).max(255).regex(/^[\w .:/@+=,-]+$/, "Invalid Auto Scaling group name"),
    albArn: arn("loadbalancer/app"),
    targetGroupArn: arn("targetgroup"),
  })
  .strict();

export type ConnectInput = z.infer<typeof connectSchema>;
