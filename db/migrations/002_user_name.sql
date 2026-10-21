-- Keep existing accounts compatible; signup validates names for new accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
