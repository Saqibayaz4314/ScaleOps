import type { AwsConfig } from "@/lib/env";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Everything needed to talk to one user's AWS account. Server-only; never serialized to the browser. */
export interface AwsContext extends AwsConfig {
  connectionId: string;
  /** Changes whenever the connection is edited; part of cache keys. */
  version: number;
  credentials: AwsCredentials;
}
