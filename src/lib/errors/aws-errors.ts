import type { AwsErrorCode, PanelError, PanelSource } from "@/types/api";

export class ResourceMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceMissingError";
  }
}

const MESSAGES: Record<AwsErrorCode, string> = {
  NOT_CONNECTED: "No AWS account is connected. Connect one under Connection.",
  NOT_CONFIGURED: "The server is not configured correctly. Contact the operator.",
  AWS_ACCESS_DENIED:
    "AWS denied access. Check that the dashboard's read-only IAM policy allows this action.",
  AWS_RESOURCE_MISSING:
    "AWS resource not found. Check the region and resource identifiers against Terraform outputs.",
  AWS_THROTTLED: "AWS is rate-limiting requests. Data will retry on the next refresh.",
  AWS_TIMEOUT: "The AWS request timed out. Retry shortly.",
  AWS_UNAVAILABLE: "AWS could not be reached or returned an unexpected error.",
  NO_DATAPOINTS: "No CloudWatch datapoints returned for this window.",
};

export function messageFor(code: AwsErrorCode): string {
  return MESSAGES[code];
}

/** Fixed messages only: never expose signed requests, credentials or raw SDK messages. */
export function identityFailure(error: unknown): { status: number; code: AwsErrorCode; reason: string; message: string } {
  const e = error as { name?: string; Code?: string; code?: string };
  const name = `${e?.name ?? ""} ${e?.Code ?? ""} ${e?.code ?? ""}`;
  if (/RequestExpired|RequestTimeTooSkewed|RequestInTheFuture|SignatureNotYetCurrent/.test(name))
    return { status: 400, code: "AWS_ACCESS_DENIED", reason: "CLOCK_SKEW", message: "AWS rejected the request timestamp. Synchronize this server's date/time automatically, then retry (CLOCK_SKEW)." };
  if (/SignatureDoesNotMatch|InvalidSignature/.test(name))
    return { status: 400, code: "AWS_ACCESS_DENIED", reason: "SIGNATURE_MISMATCH", message: "AWS reports a signature mismatch. Check that the access key ID and secret are from the same key pair, and verify the region and server clock (SIGNATURE_MISMATCH)." };
  if (/InvalidClientTokenId|UnrecognizedClient/.test(name))
    return { status: 400, code: "AWS_ACCESS_DENIED", reason: "INVALID_TOKEN", message: "AWS does not recognize this access key. Check that this exact key is Active in IAM and belongs to this AWS partition. Temporary credentials also require a session token and are not supported by this form (INVALID_TOKEN)." };
  if (/ExpiredToken/.test(name))
    return { status: 400, code: "AWS_ACCESS_DENIED", reason: "EXPIRED_TOKEN", message: "AWS says these credentials have expired. This form accepts active long-term IAM user keys, not temporary session credentials (EXPIRED_TOKEN)." };
  if (/RegionDisabled|OptInRequired/.test(name))
    return { status: 400, code: "AWS_ACCESS_DENIED", reason: "REGION_DISABLED", message: "AWS STS or the selected region is not enabled for this account. Enable it or choose the deployment's enabled region (REGION_DISABLED)." };
  const code = classify(error);
  if (code === "AWS_THROTTLED") return { status: 429, code, reason: "THROTTLED", message: "AWS is throttling identity verification. Wait briefly and retry (THROTTLED)." };
  if (code === "AWS_TIMEOUT") return { status: 504, code, reason: "TIMEOUT", message: "AWS STS verification timed out. Check server connectivity and retry (TIMEOUT)." };
  if (code === "AWS_ACCESS_DENIED") return { status: 403, code, reason: "ACCESS_DENIED", message: "AWS STS returned access denied. This does not by itself prove the secret is incorrect; check endpoint/network restrictions and account access (ACCESS_DENIED)." };
  return { status: 502, code, reason: "UNAVAILABLE", message: "AWS STS could not be reached. Check the region and server network connection (UNAVAILABLE)." };
}

/** Classifies any thrown value into a sanitized PanelError. Never includes SDK messages or stacks. */
export function normalizeAwsError(error: unknown, source: PanelSource): PanelError {
  return build(source, classify(error));
}

function build(source: PanelSource, code: AwsErrorCode): PanelError {
  return { source, code, message: MESSAGES[code] };
}

export function classify(error: unknown): AwsErrorCode {
  if (error instanceof ResourceMissingError) return "AWS_RESOURCE_MISSING";
  const e = error as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const name = `${e?.name ?? ""} ${e?.Code ?? ""} ${e?.code ?? ""}`;
  const status = e?.$metadata?.httpStatusCode;
  if (/AbortError|TimeoutError|ETIMEDOUT/i.test(name)) return "AWS_TIMEOUT";
  // Network-level failures (DNS, refused, reset) are "unavailable", never "resource missing".
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH/.test(name)) return "AWS_UNAVAILABLE";
  if (/Throttl|RequestLimitExceeded|TooManyRequests|LimitExceeded/i.test(name) || status === 429)
    return "AWS_THROTTLED";
  if (/AccessDenied|UnauthorizedOperation|UnauthorizedAccess|AuthFailure|ExpiredToken|InvalidClientTokenId|SignatureDoesNotMatch|UnrecognizedClient|RequestExpired|RequestTimeTooSkewed|RegionDisabled/i.test(name) || status === 403)
    return "AWS_ACCESS_DENIED";
  // Case-sensitive on purpose: AWS error codes are PascalCase (e.g. LoadBalancerNotFound).
  if (/NotFound|InvalidInstanceID/.test(name) || /^ValidationError/.test(e?.name ?? "") && /not found/i.test(String((error as Error)?.message)))
    return "AWS_RESOURCE_MISSING";
  if (/CredentialsProviderError|CredentialsError|Could not load credentials/i.test(name))
    return "AWS_ACCESS_DENIED";
  return "AWS_UNAVAILABLE";
}
