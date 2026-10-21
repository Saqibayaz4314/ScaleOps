-- ScaleOps schema v1. Plain SQL, applied in order by scripts/migrate.mjs.
-- gen_random_uuid() is built in since PostgreSQL 13 (no extension needed).

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email)),
  CONSTRAINT users_email_len CHECK (char_length(email) BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX users_email_key ON users (email);

-- Server-side sessions: the cookie holds a random token, only its SHA-256 is stored,
-- so a database leak does not yield usable session tokens and sessions are revocable.
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One AWS connection per user (UNIQUE user_id). Credentials are stored ONLY as an
-- AES-256-GCM blob (credentials_enc); the access key id hint is the last 4 chars for display.
CREATE TABLE aws_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  region            text NOT NULL,
  asg_name          text NOT NULL,
  alb_arn           text NOT NULL,
  target_group_arn  text NOT NULL,
  credentials_enc   text NOT NULL,
  key_hint          text NOT NULL,
  aws_account_id    text,
  principal_arn     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_verified_at  timestamptz,
  last_error        text
);

-- Cross-instance rate limiting (serverless instances share no memory).
CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  count        integer NOT NULL,
  window_start timestamptz NOT NULL
);

-- Security-relevant events. Never contains secrets.
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  event      text NOT NULL,
  ip         text,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_log (user_id, created_at DESC);
