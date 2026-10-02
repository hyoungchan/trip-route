import type { Place } from "@/types/trip";
import { isNoStayPlace } from "@/lib/place-category";

export const DEFAULT_STAY_MINUTES = 60;
export const DEFAULT_DAY_START_TIME = "09:00";

export const STAY_PRESETS = [30, 60, 90, 120, 180] as const;
export const DEFAULT_TRAVEL_MINUTES = 0;

export type PlaceTimeSlot = {
  placeId: string;
  stayMinutes: number;
  travelMinutesToNext: number;
  startMinutes: number;
  endMinutes: number;
};

export function getStayMinutes(
  place: Pick<Place, "stayMinutes" | "category" | "kind">,
): number {
  if (isNoStayPlace(place)) {
    return 0;
  }
  const value = place.stayMinutes;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return DEFAULT_STAY_MINUTES;
}

export function getTravelMinutes(place: Pick<Place, "travelMinutesToNext">): number {
  const value = place.travelMinutesToNext;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return DEFAULT_TRAVEL_MINUTES;
}

export function parseClockTime(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

export function normalizeClockTime(value: string | undefined): string {
  return parseClockTime(value) == null ? DEFAULT_DAY_START_TIME : value!.trim();
}

export function formatStayLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}분`;
  }
  if (rest === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${rest}분`;
}

export function formatClockLabel(totalMinutes: number): string {
  const nextDay = totalMinutes >= 24 * 60;
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return nextDay ? `다음날 ${clock}` : clock;
}

export function buildDayTimeSlots(
  places: Place[],
  startTime: string | undefined,
): PlaceTimeSlot[] {
  let cursor = parseClockTime(startTime) ?? parseClockTime(DEFAULT_DAY_START_TIME)!;

  return places.map((place, index) => {
    const stayMinutes = getStayMinutes(place);
    const travelMinutesToNext =
      index < places.length - 1 ? getTravelMinutes(place) : 0;
    const startMinutes = cursor;
    const endMinutes = startMinutes + stayMinutes;
    cursor = endMinutes + travelMinutesToNext;
    return {
      placeId: place.id,
      stayMinutes,
      travelMinutesToNext,
      startMinutes,
      endMinutes,
    };
  });
}
