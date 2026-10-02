import type { Trip } from "@/types/trip";

export type SharedTripPayload = {
  trip: Trip;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

export class SharedTripConflictError extends Error {
  trip: Trip;
  version: number;

  constructor(trip: Trip, version: number) {
    super("CONFLICT");
    this.name = "SharedTripConflictError";
    this.trip = trip;
    this.version = version;
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageFrom(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

export async function createSharedTrip(trip: Trip): Promise<SharedTripPayload & { id: string }> {
  const response = await fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trip }),
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(messageFrom(data, "공유 링크를 만들지 못했습니다."));
  }
  const created = data.trip as Trip | undefined;
  const id = typeof data.id === "string" ? data.id : created?.id;
  if (!created || !id || typeof data.version !== "number") {
    throw new Error("공유 링크를 만들지 못했습니다.");
  }
  return {
    id,
    trip: created,
    version: data.version,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  };
}

export async function loadSharedTrip(shareId: string): Promise<SharedTripPayload | null> {
  const response = await fetch(`/api/trips/${encodeURIComponent(shareId)}`, {
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(messageFrom(data, "공유 일정을 불러오지 못했습니다."));
  }
  const trip = data.trip as Trip | undefined;
  if (!trip || typeof data.version !== "number") {
    throw new Error("공유 일정을 불러오지 못했습니다.");
  }
  return {
    trip,
    version: data.version,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  };
}

export async function saveSharedTrip(
  shareId: string,
  trip: Trip,
  version: number,
): Promise<SharedTripPayload> {
  const response = await fetch(`/api/trips/${encodeURIComponent(shareId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trip, version }),
  });
  const data = await readJson(response);
  if (response.status === 409) {
    const latest = data.trip as Trip | undefined;
    const latestVersion = data.version;
    if (latest && typeof latestVersion === "number") {
      throw new SharedTripConflictError(latest, latestVersion);
    }
    throw new Error("일정이 다른 사용자에 의해 변경되었습니다. 최신 내용을 불러와 주세요.");
  }
  if (!response.ok) {
    throw new Error(messageFrom(data, "일정을 저장하지 못했습니다."));
  }
  const saved = data.trip as Trip | undefined;
  if (!saved || typeof data.version !== "number") {
    throw new Error("일정을 저장하지 못했습니다.");
  }
  return {
    trip: saved,
    version: data.version,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  };
}
