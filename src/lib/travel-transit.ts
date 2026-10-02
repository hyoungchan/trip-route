import type { TravelTransitLeg, TravelTransitStep } from "@/types/trip";

export type { TravelTransitLeg, TravelTransitStep };
export type TransitTravelMode = "bus" | "subway";

const STRING_KEYS = [
  "vehicleType",
  "vehicleName",
  "lineName",
  "lineShortName",
  "headsign",
  "departureStop",
  "arrivalStop",
] as const;

export function isTransitTravelMode(value: unknown): value is TransitTravelMode {
  return value === "bus" || value === "subway";
}

export function normalizeTravelTransit(value: unknown): TravelTransitLeg[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const legs = value
    .map((item) => normalizeTravelTransitLeg(item))
    .filter((leg): leg is TravelTransitLeg => Boolean(leg));

  return legs.length > 0 ? legs : undefined;
}

export function parseTravelTransit(value: unknown): TravelTransitLeg[] {
  return normalizeTravelTransit(value) ?? [];
}

export function normalizeTravelTransitSteps(
  value: unknown,
): TravelTransitStep[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const steps = value
    .map((item) => normalizeTravelTransitStep(item))
    .filter((step): step is TravelTransitStep => Boolean(step));

  return steps.length > 0 ? steps : undefined;
}

export function parseTravelTransitSteps(value: unknown): TravelTransitStep[] {
  return normalizeTravelTransitSteps(value) ?? [];
}

export function transitLegsMatchSelection(
  legs: TravelTransitLeg[],
  mode: TransitTravelMode,
): boolean {
  if (legs.length === 0) {
    return false;
  }
  return legs.every((leg) => vehicleKind(leg) === mode);
}

export function formatTransitTravelLabel(
  minutesLabel: string,
  distanceKm: number | undefined,
  legs: TravelTransitLeg[] | undefined,
  selectedMode?: TransitTravelMode,
) {
  const parts = [transitKindPrefix(legs, selectedMode), minutesLabel];
  if (typeof distanceKm === "number" && Number.isFinite(distanceKm)) {
    parts.push(formatDistanceKm(distanceKm));
  }
  const lineSummary = formatTransitLineSummary(legs);
  if (lineSummary) {
    parts.push(lineSummary);
  }
  if ((legs?.length ?? 0) > 1) {
    parts.push(`환승 ${(legs?.length ?? 1) - 1}회`);
  }
  return parts.join(" · ");
}

export function formatTransitLegLabel(leg: TravelTransitLeg) {
  const kind = vehicleKindLabel(leg);
  const line = leg.lineShortName || leg.lineName;
  const title = line ? `${kind} ${line}` : kind;
  if (leg.departureStop && leg.arrivalStop) {
    return `${title} · ${leg.departureStop} → ${leg.arrivalStop}`;
  }
  return title;
}

export function formatTransitRouteStepLabel(
  step: TravelTransitStep,
  options?: {
    originName?: string;
    destinationName?: string;
    index?: number;
    total?: number;
  },
) {
  const minutes = `${Math.max(0, step.durationMinutes)}분`;
  if (step.type === "TRANSIT") {
    const kind = step.transit ? vehicleKindLabel(step.transit) : "대중교통";
    const icon = step.transit && vehicleKind(step.transit) === "subway" ? "🚇" : "🚌";
    const line = step.transit?.lineShortName || step.transit?.lineName;
    const from = step.fromName || step.transit?.departureStop;
    const to = step.toName || step.transit?.arrivalStop;
    if (line && from && to) {
      return `${icon} ${line} ${from} → ${to} · ${minutes}`;
    }
    if (from && to) {
      return `${icon} ${from} → ${to} · ${minutes}`;
    }
    if (line) {
      return `${icon} ${line} · ${minutes}`;
    }
    return `${icon} ${kind} · ${minutes}`;
  }

  const index = options?.index ?? 0;
  const total = options?.total ?? 1;
  const from = step.fromName || (index === 0 ? options?.originName : undefined);
  const to =
    step.toName || (index === total - 1 ? options?.destinationName : undefined);
  if (from && to) {
    if (from === to) {
      return `🚶 환승 · ${minutes}`;
    }
    return `🚶 ${from} → ${to} · ${minutes}`;
  }
  if (from) {
    return `🚶 ${from} · ${minutes}`;
  }
  if (to) {
    return `🚶 ${to} · ${minutes}`;
  }
  if (index > 0 && index < total - 1) {
    return `🚶 환승 · ${minutes}`;
  }
  return `🚶 도보 · ${minutes}`;
}

function normalizeTravelTransitStep(value: unknown): TravelTransitStep | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const type = source.type === "WALK" || source.type === "TRANSIT" ? source.type : null;
  if (!type) {
    return null;
  }

  const durationMinutes =
    typeof source.durationMinutes === "number" && Number.isFinite(source.durationMinutes)
      ? Math.max(0, Math.round(source.durationMinutes))
      : null;
  if (durationMinutes == null) {
    return null;
  }

  const fromName =
    typeof source.fromName === "string" && source.fromName.trim()
      ? source.fromName.trim()
      : undefined;
  const toName =
    typeof source.toName === "string" && source.toName.trim()
      ? source.toName.trim()
      : undefined;
  const transit = source.transit
    ? normalizeTravelTransitLeg(source.transit) ?? undefined
    : undefined;

  return {
    type,
    durationMinutes,
    ...(fromName ? { fromName } : {}),
    ...(toName ? { toName } : {}),
    ...(transit ? { transit } : {}),
  };
}

function normalizeTravelTransitLeg(value: unknown): TravelTransitLeg | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const leg: TravelTransitLeg = {};

  for (const key of STRING_KEYS) {
    const next = source[key];
    if (typeof next === "string" && next.trim()) {
      leg[key] = next.trim();
    }
  }

  if (typeof source.stopCount === "number" && Number.isFinite(source.stopCount)) {
    leg.stopCount = Math.max(0, Math.round(source.stopCount));
  }

  return Object.keys(leg).length > 0 ? leg : null;
}

function transitKindPrefix(
  legs: TravelTransitLeg[] | undefined,
  selectedMode?: TransitTravelMode,
) {
  if (selectedMode === "subway") {
    return "🚇 지하철";
  }
  if (selectedMode === "bus") {
    return "🚌 버스";
  }
  const kinds = new Set((legs ?? []).map(vehicleKind).filter((kind) => kind !== "other"));
  if (kinds.size === 1 && kinds.has("subway")) {
    return "🚇 지하철";
  }
  if (kinds.size === 1 && kinds.has("bus")) {
    return "🚌 버스";
  }
  if (kinds.has("bus") && kinds.has("subway")) {
    return "🚌🚇 대중교통";
  }
  return "🚌 대중교통";
}

function formatTransitLineSummary(legs: TravelTransitLeg[] | undefined) {
  const names = (legs ?? [])
    .map((leg) => leg.lineShortName || leg.lineName)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) {
    return "";
  }
  return [...new Set(names)].join(" → ");
}

function vehicleKind(leg: TravelTransitLeg): "bus" | "subway" | "other" {
  const type = (leg.vehicleType ?? "").toUpperCase();
  if (type === "BUS" || type === "INTERCITY_BUS" || type === "TROLLEYBUS") {
    return "bus";
  }
  if (type === "SUBWAY") {
    return "subway";
  }
  return "other";
}

function vehicleKindLabel(leg: TravelTransitLeg) {
  const kind = vehicleKind(leg);
  if (kind === "bus") {
    return "버스";
  }
  if (kind === "subway") {
    return "지하철";
  }
  return leg.vehicleName || leg.vehicleType || "대중교통";
}

function formatDistanceKm(distanceKm: number) {
  const rounded = Math.round(distanceKm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}km` : `${rounded.toFixed(1)}km`;
}
