import { neon } from "@neondatabase/serverless";

let ensured = false;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function sql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
  return neon(databaseUrl);
}

export async function ensureSharedTripsTable() {
  if (ensured) {
    return;
  }
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS shared_trips (
      id TEXT PRIMARY KEY,
      trip JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  ensured = true;
}
