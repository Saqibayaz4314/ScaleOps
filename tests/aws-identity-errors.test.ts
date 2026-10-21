import { describe, expect, it } from "vitest";
import { identityFailure } from "@/lib/errors/aws-errors";

describe("STS identity diagnostics", () => {
  it.each([
    ["RequestExpired", "CLOCK_SKEW", 400],
    ["SignatureDoesNotMatch", "SIGNATURE_MISMATCH", 400],
    ["InvalidClientTokenId", "INVALID_TOKEN", 400],
    ["ExpiredTokenException", "EXPIRED_TOKEN", 400],
    ["RegionDisabledException", "REGION_DISABLED", 400],
    ["AccessDenied", "ACCESS_DENIED", 403],
    ["TimeoutError", "TIMEOUT", 504],
    ["ThrottlingException", "THROTTLED", 429],
    ["ECONNRESET", "UNAVAILABLE", 502],
  ])("distinguishes %s without exposing raw SDK data", (name, reason, status) => {
    const error = Object.assign(new Error("sensitive-secret-and-signed-request"), { name, $metadata: { httpStatusCode: 403 } });
    const result = identityFailure(error);
    expect(result.reason).toBe(reason);
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).not.toContain(error.message);
  });
});
