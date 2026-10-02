import {
  applyUpdatePlaceDrivingTravel,
  applyUpdatePlaceTransitTravel,
  hasCoordinates,
  localTripStore,
  type TripStore,
} from "@/lib/trips";
import {
  parseTravelTransit,
  parseTravelTransitSteps,
  transitLegsMatchSelection,
} from "@/lib/travel-transit";
import type { Place, Trip } from "@/types/trip";

function sameCoordinates(
  left?: Pick<Place, "latitude" | "longitude"> | null,
  right?: Pick<Place, "latitude" | "longitude"> | null,
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.latitude === right.latitude && left.longitude === right.longitude;
}

export function placeCoordinatesChanged(
  previous: Pick<Place, "latitude" | "longitude">,
  next: Pick<Place, "latitude" | "longitude">,
): boolean {
  if (!hasCoordinates(previous) && !hasCoordinates(next)) {
    return false;
  }
  if (!hasCoordinates(previous) || !hasCoordinates(next)) {
    return true;
  }
  return !sameCoordinates(previous, next);
}

export async function refreshAdjacentTravelTimes(
  tripId: string,
  placeId: string,
  store: TripStore = localTripStore,
): Promise<Trip | null> {
  const trip = store.getTrip(tripId);
  if (!trip) {
    return null;
  }

  const places = trip.places ?? [];
  const target = places.find((place) => place.id === placeId);
  if (!target) {
    return trip;
  }

  const dayPlaces = places.filter((place) => place.date === target.date);
  const index = dayPlaces.findIndex((place) => place.id === placeId);
  if (index < 0) {
    return trip;
  }

  const previous = index > 0 ? dayPlaces[index - 1] : undefined;
  const next = dayPlaces[index + 1];

  if (previous) {
    await applyStoredTravelMode(tripId, previous, target, store);
  }
  if (next) {
    const latest = store.getTrip(tripId);
    const origin =
      latest?.places?.find((place) => place.id === placeId) ?? target;
    await applyStoredTravelMode(tripId, origin, next, store);
  }

  return store.getTrip(tripId);
}

async function applyStoredTravelMode(
  tripId: string,
  origin: Place,
  destination: Place,
  store: TripStore,
): Promise<void> {
  if (!hasCoordinates(origin) || !hasCoordinates(destination)) {
    return;
  }

  if (origin.travelMode === "drive") {
    const result = await fetchDrivingRoute(origin, destination);
    if (!result) {
      return;
    }
    const current = store.getTrip(tripId);
    if (!current) {
      return;
    }
    store.saveTrip(
      applyUpdatePlaceDrivingTravel(
        current,
        origin.id,
        result.durationMinutes,
        result.distanceKm,
      ),
    );
    return;
  }

  if (origin.travelMode === "bus" || origin.travelMode === "subway") {
    const result = await fetchTransitRoute(origin, destination, origin.travelMode);
    if (!result) {
      return;
    }
    const current = store.getTrip(tripId);
    if (!current) {
      return;
    }
    store.saveTrip(
      applyUpdatePlaceTransitTravel(current, origin.id, {
        travelMode: origin.travelMode,
        travelMinutesToNext: result.durationMinutes,
        distanceKm: result.distanceKm,
        transit: result.transit,
        steps: result.steps,
      }),
    );
  }
}

async function fetchDrivingRoute(
  origin: Place & { latitude: number; longitude: number },
  destination: Place & { latitude: number; longitude: number },
): Promise<{ durationMinutes: number; distanceKm: number } | null> {
  try {
    const response = await fetch("/api/routes/naver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
      }),
    });
    const data = (await response.json()) as {
      durationMinutes?: unknown;
      distanceKm?: unknown;
    };
    if (
      !response.ok ||
      typeof data.durationMinutes !== "number" ||
      !Number.isFinite(data.durationMinutes)
    ) {
      return null;
    }
    return {
      durationMinutes: data.durationMinutes,
      distanceKm:
        typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
          ? data.distanceKm
          : 0,
    };
  } catch {
    return null;
  }
}

async function fetchTransitRoute(
  origin: Place & { latitude: number; longitude: number },
  destination: Place & { latitude: number; longitude: number },
  mode: "bus" | "subway",
) {
  try {
    const response = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        travelMode: "TRANSIT",
        transitPreferences: {
          allowedTravelModes: mode === "bus" ? ["BUS"] : ["SUBWAY"],
        },
      }),
    });
    const data = (await response.json()) as {
      durationMinutes?: unknown;
      distanceKm?: unknown;
      transit?: unknown;
      steps?: unknown;
    };
    if (
      !response.ok ||
      typeof data.durationMinutes !== "number" ||
      !Number.isFinite(data.durationMinutes)
    ) {
      return null;
    }
    const transit = parseTravelTransit(data.transit);
    const steps = parseTravelTransitSteps(data.steps);
    if (!transitLegsMatchSelection(transit, mode)) {
      return null;
    }
    return {
      durationMinutes: data.durationMinutes,
      distanceKm:
        typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
          ? data.distanceKm
          : 0,
      transit,
      steps,
    };
  } catch {
    return null;
  }
}
