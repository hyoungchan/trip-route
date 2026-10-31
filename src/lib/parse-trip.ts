import { normalizeTrip } from "@/lib/trips";
import type { OverviewItem, Place, Trip } from "@/types/trip";

export function parseTrip(value: unknown): Trip | null {
  let input = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const raw = input as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    typeof raw.title !== "string" ||
    typeof raw.destination !== "string" ||
    typeof raw.startDate !== "string" ||
    typeof raw.endDate !== "string"
  ) {
    return null;
  }

  const places = Array.isArray(raw.places)
    ? raw.places.filter((place): place is Place => {
        if (!place || typeof place !== "object") {
          return false;
        }
        const item = place as Record<string, unknown>;
        return (
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.address === "string" &&
          typeof item.date === "string"
        );
      })
    : [];

  const dayStartTimes =
    raw.dayStartTimes &&
    typeof raw.dayStartTimes === "object" &&
    !Array.isArray(raw.dayStartTimes)
      ? (raw.dayStartTimes as Trip["dayStartTimes"])
      : undefined;

  const overview = Array.isArray(raw.overview)
    ? raw.overview.filter((item): item is OverviewItem => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const entry = item as Record<string, unknown>;
        return (
          typeof entry.id === "string" &&
          typeof entry.date === "string" &&
          typeof entry.text === "string"
        );
      })
    : undefined;

  return normalizeTrip({
    id: raw.id.trim(),
    title: raw.title,
    destination: raw.destination,
    startDate: raw.startDate,
    endDate: raw.endDate,
    stopCount: places.length,
    places,
    ...(dayStartTimes ? { dayStartTimes } : {}),
    ...(overview ? { overview } : {}),
  });
}
