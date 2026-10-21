import type { PoolConfig } from "pg";

export type SslMode = "disable" | "require" | "no-verify";

const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";

/**
 * Builds the pg config from DATABASE_URL + DATABASE_SSL.
 *  - unset: local hosts -> no TLS; any remote host -> TLS with certificate verification
 *  - "require": TLS with verification
 *  - "no-verify": TLS without verifying the certificate (needed for Heroku Postgres, which uses
 *    a self-signed chain). Traffic is encrypted but the server is not authenticated.
 *  - "disable": no TLS
 * Any sslmode= in the URL is removed, because pg lets URL parameters override the ssl option.
 */
export function buildPoolConfig(databaseUrl: string, sslMode?: SslMode): PoolConfig {
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  const mode: SslMode = sslMode ?? (isLocal(url.hostname) ? "disable" : "require");
  return {
    connectionString: url.toString(),
    ssl: mode === "disable" ? false : { rejectUnauthorized: mode === "require" },
  };
}
