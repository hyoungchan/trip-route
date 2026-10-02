import { ensureSharedTripsTable, sql } from "@/lib/db";
import { parseTrip } from "@/lib/parse-trip";
import type { Trip } from "@/types/trip";

export type SharedTripRecord = {
  id: string;
  trip: Trip;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const MAX_TRIP_JSON_CHARS = 500_000;

export function createShareId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isShareId(value: string) {
  return /^[A-Za-z0-9_-]{8,32}$/.test(value);
}

function assertTripSize(trip: Trip) {
  const size = JSON.stringify(trip).length;
  if (size > MAX_TRIP_JSON_CHARS) {
    throw new Error("TRIP_TOO_LARGE");
  }
}

function mapRow(row: {
  id: string;
  trip: unknown;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
}): SharedTripRecord | null {
  const trip = parseTrip(row.trip);
  if (!trip) {
    return null;
  }
  return {
    id: row.id,
    trip: { ...trip, id: row.id },
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function insertSharedTrip(trip: Trip): Promise<SharedTripRecord> {
  assertTripSize(trip);
  await ensureSharedTripsTable();
  const db = sql();
  const id = createShareId();
  const stored = { ...trip, id };
  const rows = await db`
    INSERT INTO shared_trips (id, trip, version)
    VALUES (${id}, ${stored}, 1)
    RETURNING id, trip, version, created_at, updated_at
  `;
  const record = mapRow(rows[0] as Parameters<typeof mapRow>[0]);
  if (!record) {
    throw new Error("INSERT_FAILED");
  }
  return record;
}

export async function getSharedTrip(id: string): Promise<SharedTripRecord | null> {
  if (!isShareId(id)) {
    return null;
  }
  await ensureSharedTripsTable();
  const db = sql();
  const rows = await db`
    SELECT id, trip, version, created_at, updated_at
    FROM shared_trips
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!rows[0]) {
    return null;
  }
  return mapRow(rows[0] as Parameters<typeof mapRow>[0]);
}

export async function updateSharedTrip(
  id: string,
  trip: Trip,
  expectedVersion: number,
): Promise<
  | { ok: true; record: SharedTripRecord }
  | { ok: false; reason: "conflict" | "missing"; record: SharedTripRecord | null }
> {
  assertTripSize(trip);
  await ensureSharedTripsTable();
  const current = await getSharedTrip(id);
  if (!current) {
    return { ok: false, reason: "missing", record: null };
  }
  if (current.version !== expectedVersion) {
    return { ok: false, reason: "conflict", record: current };
  }

  const db = sql();
  const stored = { ...trip, id };
  const nextVersion = current.version + 1;
  const rows = await db`
    UPDATE shared_trips
    SET
      trip = ${stored},
      version = ${nextVersion},
      updated_at = NOW()
    WHERE id = ${id} AND version = ${expectedVersion}
    RETURNING id, trip, version, created_at, updated_at
  `;
  if (!rows[0]) {
    const latest = await getSharedTrip(id);
    return { ok: false, reason: latest ? "conflict" : "missing", record: latest };
  }
  const record = mapRow(rows[0] as Parameters<typeof mapRow>[0]);
  if (!record) {
    throw new Error("UPDATE_FAILED");
  }
  return { ok: true, record };
}
