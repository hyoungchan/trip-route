import { normalizeTrip } from "@/lib/trips";
import type { Place, Trip } from "@/types/trip";

export function parseTrip(value: unknown): Trip | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
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

  return normalizeTrip({
    id: raw.id.trim(),
    title: raw.title,
    destination: raw.destination,
    startDate: raw.startDate,
    endDate: raw.endDate,
    stopCount: places.length,
    places,
    ...(dayStartTimes ? { dayStartTimes } : {}),
  });
}
