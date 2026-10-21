import "server-only";
import { query } from "@/lib/db/pool";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>("SELECT id, email, name, password_hash FROM users WHERE email = $1", [
    normalizeEmail(email),
  ]);
  return rows[0] ?? null;
}

/** Returns null if the email is already registered (unique violation). */
export async function createUser(email: string, passwordHash: string, name = ""): Promise<{ id: string; email: string } | null> {
  const { rows } = await query<{ id: string; email: string }>(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING id, email`,
    [normalizeEmail(email), passwordHash, name.trim()],
  );
  return rows[0] ?? null;
}
