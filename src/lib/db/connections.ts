import "server-only";
import { decryptSecret, encryptSecret, keyringFromEnv } from "@/lib/crypto/secrets";
import { query } from "@/lib/db/pool";
import { requireServerEnv } from "@/lib/env";
import type { AwsContext, AwsCredentials } from "@/lib/aws/context";

export interface ConnectionInput {
  region: string;
  asgName: string;
  albArn: string;
  targetGroupArn: string;
}

export interface ConnectionMeta extends ConnectionInput {
  keyHint: string;
  awsAccountId: string | null;
  principalArn: string | null;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

const aad = (userId: string) => `aws_connections:${userId}`;

/** Public metadata only — the encrypted credentials never leave this module except via loadAwsContext. */
export async function getConnectionMeta(userId: string): Promise<ConnectionMeta | null> {
  const { rows } = await query(
    `SELECT region, asg_name, alb_arn, target_group_arn, key_hint, aws_account_id, principal_arn,
            created_at, updated_at, last_verified_at, last_error
     FROM aws_connections WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    region: r.region,
    asgName: r.asg_name,
    albArn: r.alb_arn,
    targetGroupArn: r.target_group_arn,
    keyHint: r.key_hint,
    awsAccountId: r.aws_account_id,
    principalArn: r.principal_arn,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : null,
    lastError: r.last_error,
  };
}

export async function hasConnection(userId: string): Promise<boolean> {
  const { rowCount } = await query("SELECT 1 FROM aws_connections WHERE user_id = $1", [userId]);
  return (rowCount ?? 0) > 0;
}

/** Decrypts this user's credentials into an in-memory context for one request. */
export async function loadAwsContext(userId: string): Promise<AwsContext | null> {
  const { rows } = await query(
    `SELECT id, region, asg_name, alb_arn, target_group_arn, credentials_enc, updated_at
     FROM aws_connections WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  const creds = JSON.parse(
    decryptSecret(r.credentials_enc, aad(userId), keyringFromEnv(requireServerEnv())),
  ) as AwsCredentials;
  return {
    connectionId: r.id,
    version: new Date(r.updated_at).getTime(),
    region: r.region,
    asgName: r.asg_name,
    albArn: r.alb_arn,
    targetGroupArn: r.target_group_arn,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  };
}

export async function saveConnection(
  userId: string,
  input: ConnectionInput,
  creds: AwsCredentials,
  identity: { accountId: string; arn: string },
): Promise<void> {
  const blob = encryptSecret(JSON.stringify(creds), aad(userId), keyringFromEnv(requireServerEnv()));
  await query(
    `INSERT INTO aws_connections
       (user_id, region, asg_name, alb_arn, target_group_arn, credentials_enc, key_hint,
        aws_account_id, principal_arn, last_verified_at, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       region = EXCLUDED.region, asg_name = EXCLUDED.asg_name, alb_arn = EXCLUDED.alb_arn,
       target_group_arn = EXCLUDED.target_group_arn, credentials_enc = EXCLUDED.credentials_enc,
       key_hint = EXCLUDED.key_hint, aws_account_id = EXCLUDED.aws_account_id,
       principal_arn = EXCLUDED.principal_arn, last_verified_at = now(), last_error = NULL,
       updated_at = now()`,
    [
      userId,
      input.region,
      input.asgName,
      input.albArn,
      input.targetGroupArn,
      blob,
      creds.accessKeyId.slice(-4),
      identity.accountId,
      identity.arn,
    ],
  );
}

export async function deleteConnection(userId: string): Promise<boolean> {
  const { rowCount } = await query("DELETE FROM aws_connections WHERE user_id = $1", [userId]);
  return (rowCount ?? 0) > 0;
}

export async function recordVerification(userId: string, error: string | null): Promise<void> {
  await query(
    `UPDATE aws_connections SET last_verified_at = CASE WHEN $2::text IS NULL THEN now() ELSE last_verified_at END,
            last_error = $2 WHERE user_id = $1`,
    [userId, error],
  );
}
