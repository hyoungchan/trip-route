import type { Place, Trip } from "@/types/trip";
import { normalizePlaceKind } from "@/lib/place-category";
import { getStayMinutes, getTravelMinutes, normalizeClockTime } from "@/lib/timetable";
import {
  isTransitTravelMode,
  normalizeTravelTransit,
  normalizeTravelTransitSteps,
} from "@/lib/travel-transit";

const TRIPS_STORAGE_KEY = "trip-route.trips";

export function normalizePlace(place: Place): Place {
  const travelMode =
    place.travelMode === "drive" ||
    place.travelMode === "walk" ||
    isTransitTravelMode(place.travelMode)
      ? place.travelMode
      : undefined;
  const travelDistanceKm =
    typeof place.travelDistanceKm === "number" &&
    Number.isFinite(place.travelDistanceKm) &&
    place.travelDistanceKm >= 0
      ? Math.round(place.travelDistanceKm * 10) / 10
      : undefined;
  const travelTransit =
    travelMode === "bus" || travelMode === "subway"
      ? normalizeTravelTransit(place.travelTransit)
      : undefined;
  const travelTransitSteps =
    travelMode === "bus" || travelMode === "subway"
      ? normalizeTravelTransitSteps(place.travelTransitSteps)
      : undefined;

  const category =
    typeof place.category === "string" && place.category.trim()
      ? place.category.trim()
      : undefined;
  const kind = normalizePlaceKind(place.kind);

  return {
    ...place,
    ...(kind ? { kind } : { kind: undefined }),
    ...(category ? { category } : { category: undefined }),
    stayMinutes: getStayMinutes({ ...place, kind, category }),
    travelMinutesToNext: getTravelMinutes(place),
    ...(travelMode ? { travelMode } : { travelMode: undefined }),
    ...(travelDistanceKm != null
      ? { travelDistanceKm }
      : { travelDistanceKm: undefined }),
    ...(travelTransit ? { travelTransit } : { travelTransit: undefined }),
    ...(travelTransitSteps
      ? { travelTransitSteps }
      : { travelTransitSteps: undefined }),
  };
}

export function normalizeTrip(trip: Trip): Trip {
  const places = Array.isArray(trip.places) ? trip.places.map(normalizePlace) : [];
  const dayStartTimes = normalizeDayStartTimes(trip.dayStartTimes);
  return {
    ...trip,
    places,
    stopCount: places.length,
    ...(Object.keys(dayStartTimes).length > 0 ? { dayStartTimes } : {}),
  };
}

function normalizeDayStartTimes(
  value: Trip["dayStartTimes"],
): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const next: Record<string, string> = {};
  for (const [date, time] of Object.entries(value)) {
    if (typeof time === "string") {
      next[date] = normalizeClockTime(time);
    }
  }
  return next;
}

export function loadCreatedTrips(): Trip[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TRIPS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Trip[];
    return Array.isArray(parsed) ? parsed.map(normalizeTrip) : [];
  } catch {
    return [];
  }
}

export function saveCreatedTrips(trips: Trip[]) {
  window.localStorage.setItem(
    TRIPS_STORAGE_KEY,
    JSON.stringify(trips.map(normalizeTrip)),
  );
}

export function getHomeTrips(): Trip[] {
  return loadCreatedTrips();
}

export function getTripById(tripId: string): Trip | null {
  return loadCreatedTrips().find((trip) => trip.id === tripId) ?? null;
}

const COLLAPSED_DATES_STORAGE_KEY = "trip-route.ui.collapsedDates";
const BACKFILL_STORAGE_KEY = "trip-route.ui.categoryBackfill";

export function deleteTripById(tripId: string): Trip[] | null {
  const created = loadCreatedTrips();
  const trip = created.find((item) => item.id === tripId);
  if (!trip) {
    return null;
  }

  const nextTrips = created.filter((item) => item.id !== tripId);
  saveCreatedTrips(nextTrips);
  removeTripRelatedStorage(trip);
  return nextTrips;
}

function removeTripRelatedStorage(trip: Trip) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const collapsedRaw = window.localStorage.getItem(COLLAPSED_DATES_STORAGE_KEY);
    if (collapsedRaw) {
      const parsed = JSON.parse(collapsedRaw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const store = { ...(parsed as Record<string, unknown>) };
        delete store[trip.id];
        window.localStorage.setItem(
          COLLAPSED_DATES_STORAGE_KEY,
          JSON.stringify(store),
        );
      }
    }
  } catch {
    // UI-only persistence
  }

  try {
    const backfillRaw = window.localStorage.getItem(BACKFILL_STORAGE_KEY);
    if (!backfillRaw) {
      return;
    }
    const parsed = JSON.parse(backfillRaw) as {
      version?: unknown;
      attempted?: unknown;
    };
    if (!parsed?.attempted || typeof parsed.attempted !== "object") {
      return;
    }
    const placeIds = new Set((trip.places ?? []).map((place) => place.id));
    const attempted = { ...(parsed.attempted as Record<string, unknown>) };
    for (const placeId of placeIds) {
      delete attempted[placeId];
    }
    window.localStorage.setItem(
      BACKFILL_STORAGE_KEY,
      JSON.stringify({
        version: parsed.version,
        attempted,
      }),
    );
  } catch {
    // UI-only persistence
  }
}

function persistTrip(nextTrip: Trip): Trip | null {
  const created = loadCreatedTrips();
  const createdIndex = created.findIndex((item) => item.id === nextTrip.id);

  if (createdIndex < 0) {
    return null;
  }

  const nextCreated = [...created];
  nextCreated[createdIndex] = nextTrip;
  saveCreatedTrips(nextCreated);
  return nextTrip;
}

export function saveLocalTrip(nextTrip: Trip): Trip | null {
  return persistTrip(nextTrip);
}

export type TripStore = {
  getTrip: (tripId: string) => Trip | null;
  saveTrip: (trip: Trip) => Trip | null;
};

export const localTripStore: TripStore = {
  getTrip: getTripById,
  saveTrip: saveLocalTrip,
};

export function hasCoordinates(
  place: Pick<Place, "latitude" | "longitude">,
): place is Place & { latitude: number; longitude: number } {
  return (
    typeof place.latitude === "number" &&
    Number.isFinite(place.latitude) &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.longitude)
  );
}

export function applyAddPlaceToTrip(
  trip: Trip,
  input: {
    name: string;
    address: string;
    date: string;
    category?: string;
    kind?: Place["kind"];
    stayMinutes?: number;
    latitude?: number;
    longitude?: number;
  },
): Trip {
  const kind = normalizePlaceKind(input.kind);
  const category =
    typeof input.category === "string" && input.category.trim()
      ? input.category.trim()
      : undefined;

  const nextPlace: Place = {
    id: crypto.randomUUID(),
    name: input.name,
    address: input.address,
    date: input.date,
    stayMinutes: getStayMinutes({
      stayMinutes: input.stayMinutes,
      category,
      kind,
    }),
    ...(kind ? { kind } : {}),
    ...(category ? { category } : {}),
    ...(typeof input.latitude === "number" ? { latitude: input.latitude } : {}),
    ...(typeof input.longitude === "number" ? { longitude: input.longitude } : {}),
  };

  return normalizeTrip({
    ...trip,
    places: [...(trip.places ?? []), nextPlace],
  });
}

export function addPlaceToTrip(
  tripId: string,
  input: {
    name: string;
    address: string;
    date: string;
    category?: string;
    kind?: Place["kind"];
    stayMinutes?: number;
    latitude?: number;
    longitude?: number;
  },
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyAddPlaceToTrip(trip, input));
}

export function applyUpdatePlaceInTrip(
  trip: Trip,
  placeId: string,
  input: {
    name: string;
    address: string;
    category?: string;
    kind?: Place["kind"];
    latitude?: number;
    longitude?: number;
  },
): Trip | null {
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name || !address) {
    return null;
  }

  let updated = false;
  const nextPlaces = (trip.places ?? []).map((place) => {
    if (place.id !== placeId) {
      return place;
    }

    updated = true;
    const kind = normalizePlaceKind(input.kind);
    const category =
      typeof input.category === "string" && input.category.trim()
        ? input.category.trim()
        : undefined;

    return {
      ...place,
      name,
      address,
      stayMinutes: getStayMinutes({
        stayMinutes: place.stayMinutes,
        category,
        kind,
      }),
      ...(kind ? { kind } : { kind: undefined }),
      ...(category ? { category } : { category: undefined }),
      ...(typeof input.latitude === "number"
        ? { latitude: input.latitude }
        : { latitude: place.latitude }),
      ...(typeof input.longitude === "number"
        ? { longitude: input.longitude }
        : { longitude: place.longitude }),
    };
  });

  if (!updated) {
    return null;
  }

  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceInTrip(
  tripId: string,
  placeId: string,
  input: {
    name: string;
    address: string;
    category?: string;
    kind?: Place["kind"];
    latitude?: number;
    longitude?: number;
  },
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  const next = applyUpdatePlaceInTrip(trip, placeId, input);
  return next ? persistTrip(next) : null;
}

export function applyUpdatePlaceCoordinates(
  trip: Trip,
  updates: { id: string; latitude: number; longitude: number }[],
): Trip {
  if (updates.length === 0) {
    return trip;
  }

  const byId = new Map(updates.map((update) => [update.id, update]));
  const nextPlaces = (trip.places ?? []).map((place) => {
    const update = byId.get(place.id);
    if (!update) {
      return place;
    }
    return {
      ...place,
      latitude: update.latitude,
      longitude: update.longitude,
    };
  });

  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceCoordinates(
  tripId: string,
  updates: { id: string; latitude: number; longitude: number }[],
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip || updates.length === 0) {
    return trip;
  }
  return persistTrip(applyUpdatePlaceCoordinates(trip, updates));
}

export function updatePlacesCategory(
  tripId: string,
  updates: { id: string; category: string }[],
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip || updates.length === 0) {
    return trip;
  }

  const nextById = new Map(
    updates
      .filter(
        (update) =>
          typeof update.category === "string" && update.category.trim().length > 0,
      )
      .map((update) => [update.id, update.category.trim()]),
  );
  if (nextById.size === 0) {
    return trip;
  }

  const nextPlaces = (trip.places ?? []).map((place) => {
    const category = nextById.get(place.id);
    if (!category || (typeof place.category === "string" && place.category.trim())) {
      return place;
    }
    return { ...place, category };
  });

  return persistTrip(normalizeTrip({ ...trip, places: nextPlaces }));
}

export function applyUpdatePlaceStayMinutes(
  trip: Trip,
  placeId: string,
  stayMinutes: number,
): Trip {
  const nextPlaces = (trip.places ?? []).map((place) =>
    place.id === placeId
      ? {
          ...place,
          stayMinutes: getStayMinutes({
            stayMinutes,
            category: place.category,
            kind: place.kind,
          }),
        }
      : place,
  );
  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceStayMinutes(
  tripId: string,
  placeId: string,
  stayMinutes: number,
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyUpdatePlaceStayMinutes(trip, placeId, stayMinutes));
}

export function applyUpdatePlaceTravelMinutes(
  trip: Trip,
  placeId: string,
  travelMinutesToNext: number,
): Trip {
  const nextTravel = getTravelMinutes({ travelMinutesToNext });
  const nextPlaces = (trip.places ?? []).map((place) =>
    place.id === placeId
      ? {
          ...place,
          travelMinutesToNext: nextTravel,
          travelMode: undefined,
          travelDistanceKm: undefined,
        }
      : place,
  );
  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceTravelMinutes(
  tripId: string,
  placeId: string,
  travelMinutesToNext: number,
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyUpdatePlaceTravelMinutes(trip, placeId, travelMinutesToNext));
}

export function applyUpdatePlaceWalkTravel(
  trip: Trip,
  placeId: string,
  travelMinutesToNext: number,
): Trip {
  const nextTravel = getTravelMinutes({ travelMinutesToNext });
  const nextPlaces = (trip.places ?? []).map((place) =>
    place.id === placeId
      ? {
          ...place,
          travelMinutesToNext: nextTravel,
          travelMode: "walk" as const,
          travelDistanceKm: undefined,
          travelTransit: undefined,
          travelTransitSteps: undefined,
        }
      : place,
  );
  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceWalkTravel(
  tripId: string,
  placeId: string,
  travelMinutesToNext: number,
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyUpdatePlaceWalkTravel(trip, placeId, travelMinutesToNext));
}

export function applyUpdatePlaceDrivingTravel(
  trip: Trip,
  placeId: string,
  travelMinutesToNext: number,
  distanceKm: number,
): Trip {
  const nextTravel = getTravelMinutes({ travelMinutesToNext });
  const nextDistance =
    typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm >= 0
      ? Math.round(distanceKm * 10) / 10
      : undefined;
  const nextPlaces = (trip.places ?? []).map((place) =>
    place.id === placeId
      ? {
          ...place,
          travelMinutesToNext: nextTravel,
          travelMode: "drive" as const,
          ...(nextDistance != null ? { travelDistanceKm: nextDistance } : { travelDistanceKm: undefined }),
        }
      : place,
  );
  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceDrivingTravel(
  tripId: string,
  placeId: string,
  travelMinutesToNext: number,
  distanceKm: number,
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(
    applyUpdatePlaceDrivingTravel(trip, placeId, travelMinutesToNext, distanceKm),
  );
}

export function applyUpdatePlaceTransitTravel(
  trip: Trip,
  placeId: string,
  input: {
    travelMode: "bus" | "subway";
    travelMinutesToNext: number;
    distanceKm: number;
    transit?: Place["travelTransit"];
    steps?: Place["travelTransitSteps"];
  },
): Trip {
  const nextTravel = getTravelMinutes({
    travelMinutesToNext: input.travelMinutesToNext,
  });
  const nextDistance =
    typeof input.distanceKm === "number" &&
    Number.isFinite(input.distanceKm) &&
    input.distanceKm >= 0
      ? Math.round(input.distanceKm * 10) / 10
      : undefined;
  const nextPlaces = (trip.places ?? []).map((place) =>
    place.id === placeId
      ? {
          ...place,
          travelMinutesToNext: nextTravel,
          travelMode: input.travelMode,
          ...(nextDistance != null
            ? { travelDistanceKm: nextDistance }
            : { travelDistanceKm: undefined }),
          travelTransit: input.transit,
          travelTransitSteps: input.steps,
        }
      : place,
  );
  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function updatePlaceTransitTravel(
  tripId: string,
  placeId: string,
  input: {
    travelMode: "bus" | "subway";
    travelMinutesToNext: number;
    distanceKm: number;
    transit?: Place["travelTransit"];
    steps?: Place["travelTransitSteps"];
  },
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyUpdatePlaceTransitTravel(trip, placeId, input));
}

export function applyUpdateDayStartTime(
  trip: Trip,
  date: string,
  startTime: string,
): Trip {
  return normalizeTrip({
    ...trip,
    dayStartTimes: {
      ...(trip.dayStartTimes ?? {}),
      [date]: normalizeClockTime(startTime),
    },
  });
}

export function updateDayStartTime(
  tripId: string,
  date: string,
  startTime: string,
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyUpdateDayStartTime(trip, date, startTime));
}

export function applyDeletePlaceFromTrip(trip: Trip, placeId: string): Trip {
  return normalizeTrip({
    ...trip,
    places: (trip.places ?? []).filter((place) => place.id !== placeId),
  });
}

export function deletePlaceFromTrip(tripId: string, placeId: string): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyDeletePlaceFromTrip(trip, placeId));
}

export function applyReorderDayPlaces(
  trip: Trip,
  date: string,
  orderedPlaceIds: string[],
): Trip {
  const places = trip.places ?? [];
  const dayPlaces = places.filter((place) => place.date === date);
  const byId = new Map(dayPlaces.map((place) => [place.id, place]));
  const reorderedDay = orderedPlaceIds
    .map((id) => byId.get(id))
    .filter((place): place is Place => Boolean(place));

  if (reorderedDay.length !== dayPlaces.length) {
    return trip;
  }

  let dayIndex = 0;
  const nextPlaces = places.map((place) => {
    if (place.date !== date) {
      return place;
    }
    const next = reorderedDay[dayIndex];
    dayIndex += 1;
    return next;
  });

  return normalizeTrip({ ...trip, places: nextPlaces });
}

export function reorderDayPlaces(
  tripId: string,
  date: string,
  orderedPlaceIds: string[],
): Trip | null {
  const trip = getTripById(tripId);
  if (!trip) {
    return null;
  }
  return persistTrip(applyReorderDayPlaces(trip, date, orderedPlaceIds));
}

export function listTripDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) {
    return dates;
  }

  while (current.getTime() <= end.getTime()) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function seedNewTripCollapsedDates(
  tripId: string,
  startDate: string,
  endDate: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  const dates = listTripDates(startDate, endDate);
  const next: Record<string, boolean> = {};
  for (const date of dates.slice(1)) {
    next[date] = true;
  }

  try {
    const raw = window.localStorage.getItem(COLLAPSED_DATES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const store =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    window.localStorage.setItem(
      COLLAPSED_DATES_STORAGE_KEY,
      JSON.stringify({ ...store, [tripId]: next }),
    );
  } catch {
    // UI-only persistence
  }
}

export function formatDayLabel(date: string, index: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `Day ${index + 1}`;
  }

  const weekday = parsed.toLocaleDateString("ko-KR", { weekday: "short" });
  const dateLabel = parsed.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });

  return `${dateLabel} (${weekday}) · Day ${index + 1}`;
}

export function formatTripPeriod(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "일정 미정";
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("ko-KR", {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
  });

  return `${startLabel} – ${endLabel}`;
}

export function getTripDuration(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const nights = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return `${nights}박 ${nights + 1}일`;
}
