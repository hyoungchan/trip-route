export const GOOGLE_TRAVEL_MODES = ["DRIVE", "WALK", "TRANSIT"] as const;
export const GOOGLE_TRANSIT_ALLOWED_MODES = ["BUS", "SUBWAY"] as const;

export type GoogleTravelMode = (typeof GOOGLE_TRAVEL_MODES)[number];
export type GoogleTransitAllowedMode = (typeof GOOGLE_TRANSIT_ALLOWED_MODES)[number];

export type RouteLatLng = {
  lat: number;
  lng: number;
};

export type TransitStepSummary = {
  vehicleType?: string;
  vehicleName?: string;
  lineName?: string;
  lineShortName?: string;
  headsign?: string;
  departureStop?: string;
  arrivalStop?: string;
  stopCount?: number;
};

export type TransitRouteStep = {
  type: "WALK" | "TRANSIT";
  durationMinutes: number;
  fromName?: string;
  toName?: string;
  transit?: TransitStepSummary;
};

export type ComputedRoute = {
  durationSeconds: number;
  durationMinutes: number;
  distanceMeters: number;
  distanceKm: number;
  travelMode: GoogleTravelMode;
  transit?: TransitStepSummary[];
  steps?: TransitRouteStep[];
};

type GoogleLatLng = {
  latitude?: number;
  longitude?: number;
};

type GoogleTransitDetails = {
  stopDetails?: {
    arrivalStop?: { name?: string };
    departureStop?: { name?: string };
  };
  headsign?: string;
  stopCount?: number;
  transitLine?: {
    name?: string;
    nameShort?: string;
    vehicle?: {
      name?: { text?: string };
      type?: string;
    };
  };
};

type GoogleRouteStep = {
  travelMode?: string;
  duration?: string;
  staticDuration?: string;
  transitDetails?: GoogleTransitDetails;
  steps?: GoogleRouteStep[];
};

type GoogleComputeRoutesResponse = {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
    legs?: Array<{
      steps?: GoogleRouteStep[];
    }>;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export function isGoogleTravelMode(value: unknown): value is GoogleTravelMode {
  return (
    typeof value === "string" &&
    GOOGLE_TRAVEL_MODES.includes(value as GoogleTravelMode)
  );
}

export function isGoogleTransitAllowedMode(
  value: unknown,
): value is GoogleTransitAllowedMode {
  return (
    typeof value === "string" &&
    GOOGLE_TRANSIT_ALLOWED_MODES.includes(value as GoogleTransitAllowedMode)
  );
}

export function parseAllowedTravelModes(
  value: unknown,
): { ok: true; modes: GoogleTransitAllowedMode[] | null } | { ok: false } {
  if (value == null) {
    return { ok: true, modes: null };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false };
  }
  const modes: GoogleTransitAllowedMode[] = [];
  for (const item of value) {
    if (!isGoogleTransitAllowedMode(item)) {
      return { ok: false };
    }
    if (!modes.includes(item)) {
      modes.push(item);
    }
  }
  return modes.length > 0 ? { ok: true, modes } : { ok: false };
}

export function routeMatchesAllowedTransit(
  route: ComputedRoute,
  allowed: GoogleTransitAllowedMode[],
): boolean {
  const legs = route.transit ?? [];
  if (legs.length === 0 || allowed.length === 0) {
    return false;
  }
  return legs.every((leg) => transitVehicleMatchesAllowed(leg.vehicleType, allowed));
}

function transitVehicleMatchesAllowed(
  vehicleType: string | undefined,
  allowed: GoogleTransitAllowedMode[],
): boolean {
  const type = (vehicleType ?? "").toUpperCase();
  if (
    allowed.includes("BUS") &&
    (type === "BUS" || type === "INTERCITY_BUS" || type === "TROLLEYBUS")
  ) {
    return true;
  }
  if (allowed.includes("SUBWAY") && type === "SUBWAY") {
    return true;
  }
  return false;
}

export function isValidLatLng(value: unknown): value is RouteLatLng {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

export function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.round(seconds);
}

export function summarizeTransitSteps(
  route: NonNullable<GoogleComputeRoutesResponse["routes"]>[number],
): TransitStepSummary[] {
  return collectRouteSteps(route)
    .map((step) => summarizeTransitDetails(step.transitDetails))
    .filter((leg): leg is TransitStepSummary => Boolean(leg));
}

export function extractTransitRouteSteps(
  route: NonNullable<GoogleComputeRoutesResponse["routes"]>[number],
): TransitRouteStep[] {
  const rawSteps = collectRouteSteps(route);
  const mapped = rawSteps
    .map((step) => mapRouteStep(step))
    .filter((step): step is MappedRouteStep => Boolean(step));

  return fillWalkStopNames(mergeConsecutiveWalkSteps(mapped)).map(toTransitRouteStep);
}

function collectRouteSteps(
  route: NonNullable<GoogleComputeRoutesResponse["routes"]>[number],
): GoogleRouteStep[] {
  const collected: GoogleRouteStep[] = [];
  for (const leg of route.legs ?? []) {
    flattenRouteSteps(leg.steps ?? [], collected);
  }
  return collected;
}

function flattenRouteSteps(steps: GoogleRouteStep[], collected: GoogleRouteStep[]) {
  for (const step of steps) {
    const nested = step.steps ?? [];
    if (nested.length > 0 && !step.transitDetails) {
      flattenRouteSteps(nested, collected);
      continue;
    }
    collected.push(step);
  }
}

type MappedRouteStep = TransitRouteStep & { durationSeconds: number };

function mapRouteStep(step: GoogleRouteStep): MappedRouteStep | null {
  const details = summarizeTransitDetails(step.transitDetails);
  const mode = (step.travelMode ?? "").toUpperCase();
  const type: TransitRouteStep["type"] =
    mode === "TRANSIT" || details ? "TRANSIT" : "WALK";
  const durationSeconds =
    parseDurationSeconds(step.duration) ?? parseDurationSeconds(step.staticDuration) ?? 0;

  if (durationSeconds <= 0 && !details) {
    return null;
  }

  return {
    type,
    durationSeconds,
    durationMinutes: secondsToMinutes(durationSeconds),
    ...(details?.departureStop ? { fromName: details.departureStop } : {}),
    ...(details?.arrivalStop ? { toName: details.arrivalStop } : {}),
    ...(details ? { transit: details } : {}),
  };
}

function mergeConsecutiveWalkSteps(steps: MappedRouteStep[]): MappedRouteStep[] {
  const merged: MappedRouteStep[] = [];

  for (const step of steps) {
    const previous = merged[merged.length - 1];
    if (step.type !== "WALK") {
      merged.push(step);
      continue;
    }
    if (previous?.type !== "WALK") {
      merged.push({ ...step });
      continue;
    }

    previous.durationSeconds += step.durationSeconds;
    previous.durationMinutes = secondsToMinutes(previous.durationSeconds);
    previous.toName = step.toName || previous.toName;
  }

  return merged.filter(
    (step) => step.type === "TRANSIT" || step.durationSeconds > 0,
  );
}

function secondsToMinutes(durationSeconds: number) {
  if (durationSeconds <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(durationSeconds / 60));
}

function toTransitRouteStep(step: MappedRouteStep): TransitRouteStep {
  const { durationSeconds: _durationSeconds, ...rest } = step;
  return rest;
}

function fillWalkStopNames(steps: MappedRouteStep[]): MappedRouteStep[] {
  return steps.map((step, index) => {
    if (step.type !== "WALK") {
      return step;
    }

    const previous = previousTransitStep(steps, index);
    const next = nextTransitStep(steps, index);
    const fromName = step.fromName || previous?.toName || previous?.transit?.arrivalStop;
    const toName = step.toName || next?.fromName || next?.transit?.departureStop;

    return {
      ...step,
      ...(fromName ? { fromName } : {}),
      ...(toName ? { toName } : {}),
    };
  });
}

function previousTransitStep(steps: MappedRouteStep[], index: number) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (steps[i]?.type === "TRANSIT") {
      return steps[i];
    }
  }
  return undefined;
}

function nextTransitStep(steps: MappedRouteStep[], index: number) {
  for (let i = index + 1; i < steps.length; i += 1) {
    if (steps[i]?.type === "TRANSIT") {
      return steps[i];
    }
  }
  return undefined;
}

function summarizeTransitDetails(
  details: GoogleTransitDetails | undefined,
): TransitStepSummary | null {
  if (!details) {
    return null;
  }

  const vehicleType = details.transitLine?.vehicle?.type;
  const vehicleName = details.transitLine?.vehicle?.name?.text;
  const lineName = details.transitLine?.name;
  const lineShortName = details.transitLine?.nameShort;
  const headsign = details.headsign;
  const departureStop = details.stopDetails?.departureStop?.name;
  const arrivalStop = details.stopDetails?.arrivalStop?.name;
  const stopCount = details.stopCount;
  const summary: TransitStepSummary = {
    ...(vehicleType ? { vehicleType } : {}),
    ...(vehicleName ? { vehicleName } : {}),
    ...(lineName ? { lineName } : {}),
    ...(lineShortName ? { lineShortName } : {}),
    ...(headsign ? { headsign } : {}),
    ...(departureStop ? { departureStop } : {}),
    ...(arrivalStop ? { arrivalStop } : {}),
    ...(typeof stopCount === "number" ? { stopCount } : {}),
  };

  return Object.keys(summary).length > 0 ? summary : null;
}

export function mapGoogleRoute(
  data: GoogleComputeRoutesResponse,
  travelMode: GoogleTravelMode,
):
  | { ok: true; route: ComputedRoute }
  | { ok: false; reason: "no-route" | "invalid-response" } {
  const first = data.routes?.[0];
  if (!first) {
    return { ok: false, reason: "no-route" };
  }

  const durationSeconds = parseDurationSeconds(first.duration);
  const distanceMeters =
    typeof first.distanceMeters === "number" && Number.isFinite(first.distanceMeters)
      ? Math.max(0, Math.round(first.distanceMeters))
      : null;

  if (durationSeconds == null || distanceMeters == null) {
    return { ok: false, reason: "invalid-response" };
  }

  const transit = travelMode === "TRANSIT" ? summarizeTransitSteps(first) : [];
  const steps = travelMode === "TRANSIT" ? extractTransitRouteSteps(first) : [];

  return {
    ok: true,
    route: {
      durationSeconds,
      durationMinutes:
        durationSeconds === 0 ? 0 : Math.max(1, Math.round(durationSeconds / 60)),
      distanceMeters,
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      travelMode,
      ...(transit.length > 0 ? { transit } : {}),
      ...(steps.length > 0 ? { steps } : {}),
    },
  };
}

export function googleLatLng(point: RouteLatLng): GoogleLatLng {
  return { latitude: point.lat, longitude: point.lng };
}

export function googleErrorMessage(data: GoogleComputeRoutesResponse): string {
  return data.error?.message?.trim() || "";
}

export function googleErrorStatus(data: GoogleComputeRoutesResponse): string {
  return data.error?.status?.trim() || "";
}

export type { GoogleComputeRoutesResponse };
