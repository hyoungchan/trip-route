import type { Place, Trip } from "@/types/trip";
import { getHomeTrips, getTripById, updatePlacesCategory } from "@/lib/trips";

const BACKFILL_STORAGE_KEY = "trip-route.ui.categoryBackfill";
export const CATEGORY_MATCH_VERSION = 3;

type SearchHit = {
  name: string;
  address: string;
  category?: string;
};

export type CategoryBackfillResult = {
  filled: number;
  unmatched: number;
  skipped: number;
  trip: Trip;
};

let globalJob: Promise<{
  filled: number;
  unmatched: number;
  skipped: number;
}> | null = null;

export function backfillMissingPlaceCategories(
  tripId: string,
): Promise<CategoryBackfillResult | null> {
  if (!globalJob) {
    globalJob = runBackfill().finally(() => {
      globalJob = null;
    });
  }
  return globalJob.then((stats) => {
    const trip = getTripById(tripId);
    if (!trip) {
      return null;
    }
    return { ...stats, trip };
  });
}

async function runBackfill(): Promise<{
  filled: number;
  unmatched: number;
  skipped: number;
}> {
  const trips = getHomeTrips();
  const attempted = loadAttemptedVersions();
  const pending: { tripId: string; place: Place }[] = [];
  let totalPlaces = 0;

  for (const trip of trips) {
    for (const place of trip.places ?? []) {
      totalPlaces += 1;
      if (hasCategory(place.category)) {
        continue;
      }
      if ((attempted[place.id] ?? 0) >= CATEGORY_MATCH_VERSION) {
        continue;
      }
      pending.push({ tripId: trip.id, place });
    }
  }

  if (pending.length === 0) {
    return { filled: 0, unmatched: 0, skipped: totalPlaces };
  }

  const updatesByTrip = new Map<string, { id: string; category: string }[]>();
  let unmatched = 0;

  for (const { tripId, place } of pending) {
    try {
      const hits = await searchPlacesForBackfill(place.name);
      let match = pickCategoryMatch(place, hits);
      if (!match && place.address?.trim()) {
        const narrowed = `${place.name} ${place.address}`.trim();
        if (narrowed !== place.name.trim()) {
          const extraHits = await searchPlacesForBackfill(narrowed);
          match = pickCategoryMatch(place, extraHits);
        }
      }
      markAttempted(place.id);
      if (match?.category) {
        const list = updatesByTrip.get(tripId) ?? [];
        list.push({ id: place.id, category: match.category });
        updatesByTrip.set(tripId, list);
      } else {
        unmatched += 1;
      }
    } catch {
      unmatched += 1;
    }
  }

  for (const [tripId, updates] of updatesByTrip) {
    updatePlacesCategory(tripId, updates);
  }

  let filled = 0;
  for (const updates of updatesByTrip.values()) {
    filled += updates.length;
  }

  return {
    filled,
    unmatched,
    skipped: totalPlaces - pending.length,
  };
}

export function pickCategoryMatch(
  place: Pick<Place, "name" | "address">,
  hits: SearchHit[],
): SearchHit | null {
  const scored = hits
    .filter((hit) => hasCategory(hit.category))
    .map((hit) => ({
      hit,
      score: nameScore(place.name, hit.name),
    }))
    .filter((item) => item.score > 0);
  if (scored.length === 0) {
    return null;
  }

  const withAddress = scored.filter((item) =>
    addressesClearlyMatch(place.address, item.hit.address),
  );
  if (withAddress.length > 0) {
    return pickTopScored(withAddress);
  }

  const exact = scored.filter((item) => item.score >= 100);
  if (exact.length === 1) {
    return exact[0]?.hit ?? null;
  }
  const high = scored.filter((item) => item.score >= 85);
  if (high.length === 1) {
    return high[0]?.hit ?? null;
  }
  return null;
}

function pickTopScored(
  items: { hit: SearchHit; score: number }[],
): SearchHit | null {
  const max = Math.max(...items.map((item) => item.score));
  const top = items.filter((item) => item.score === max).map((item) => item.hit);
  return resolveUniqueCandidate(top);
}

function resolveUniqueCandidate(hits: SearchHit[]): SearchHit | null {
  if (hits.length === 1) {
    return hits[0] ?? null;
  }
  if (hits.length > 1) {
    const categories = new Set(hits.map((hit) => hit.category?.trim()));
    if (categories.size === 1) {
      return hits[0] ?? null;
    }
  }
  return null;
}

function hasCategory(category?: string): boolean {
  return typeof category === "string" && category.trim().length > 0;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function nameScore(stored: string, result: string): number {
  const storedName = stored.trim();
  const resultName = result.trim();
  if (!storedName || !resultName) {
    return 0;
  }
  const storedCompact = normalizeText(storedName);
  const resultCompact = normalizeText(resultName);
  if (storedCompact === resultCompact) {
    return 100;
  }
  const tokens = resultName.split(/\s+/).filter(Boolean);
  const lastToken = tokens.at(-1);
  if (lastToken && normalizeText(lastToken) === storedCompact) {
    return 85;
  }
  const firstToken = tokens[0];
  if (firstToken && normalizeText(firstToken) === storedCompact) {
    const rest = tokens.slice(1).join("");
    if (rest.endsWith("점") || rest.includes("지점")) {
      return 70;
    }
    return 50;
  }
  if (
    resultName.startsWith(storedName) &&
    /^\s+\S/.test(resultName.slice(storedName.length))
  ) {
    return resultName.includes("점") ? 70 : 45;
  }
  if (
    storedCompact.length >= 2 &&
    resultCompact.startsWith(storedCompact) &&
    resultCompact.length > storedCompact.length
  ) {
    const rest = resultCompact.slice(storedCompact.length);
    if (rest.endsWith("점") || rest.includes("지점")) {
      return 70;
    }
  }
  return 0;
}

function extractAddressParts(address: string) {
  const compact = stripCityPrefix(normalizeText(address));
  return {
    compact,
    districts: compact.match(/[가-힣]{2,4}(?:구|군)/g) ?? [],
    neighborhoods: compact.match(/[가-힣]{1,5}(?:동|읍|면)(?!길)/g) ?? [],
    roads: compact.match(/[가-힣0-9]+(?:번길|로|길)/g) ?? [],
  };
}

function stripCityPrefix(compact: string): string {
  return compact
    .replace(/특별자치시|특별자치도|광역시|특별시/g, "")
    .replace(
      /^(서울|부산|대구|인천|광주|대전|울산|세종|제주|[가-힣]{2,4}도)/,
      "",
    );
}

function hasOverlap(left: string[], right: string[]): boolean {
  return left.some((item) => right.includes(item));
}

function addressesClearlyMatch(stored: string, result: string): boolean {
  const storedParts = extractAddressParts(stored);
  const resultParts = extractAddressParts(result);
  if (!storedParts.compact || !resultParts.compact) {
    return false;
  }
  if (storedParts.compact === resultParts.compact) {
    return true;
  }

  const districtHit = hasOverlap(storedParts.districts, resultParts.districts);
  const neighborhoodHit = hasOverlap(
    storedParts.neighborhoods,
    resultParts.neighborhoods,
  );
  const roadHit = hasOverlap(storedParts.roads, resultParts.roads);

  if (
    storedParts.districts.length > 0 &&
    resultParts.districts.length > 0 &&
    !districtHit
  ) {
    return false;
  }

  if (districtHit || neighborhoodHit || roadHit) {
    return true;
  }

  const shorter =
    storedParts.compact.length <= resultParts.compact.length
      ? storedParts.compact
      : resultParts.compact;
  const longer =
    shorter === storedParts.compact ? resultParts.compact : storedParts.compact;
  return shorter.length >= 8 && longer.includes(shorter);
}

async function searchPlacesForBackfill(name: string): Promise<SearchHit[]> {
  const trimmed = name.trim();
  if (!trimmed) {
    return [];
  }
  const response = await fetch(
    `/api/places/search?query=${encodeURIComponent(trimmed)}`,
  );
  if (!response.ok) {
    throw new Error("SEARCH_FAILED");
  }
  const data = (await response.json()) as { places?: SearchHit[] };
  return Array.isArray(data.places) ? data.places : [];
}

function loadAttemptedVersions(): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(BACKFILL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      attempted?: unknown;
    };
    if (!parsed?.attempted || typeof parsed.attempted !== "object") {
      return {};
    }
    const next: Record<string, number> = {};
    for (const [id, value] of Object.entries(
      parsed.attempted as Record<string, unknown>,
    )) {
      if (value === true) {
        next[id] = 1;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        next[id] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function markAttempted(placeId: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const attempted = loadAttemptedVersions();
    attempted[placeId] = CATEGORY_MATCH_VERSION;
    window.localStorage.setItem(
      BACKFILL_STORAGE_KEY,
      JSON.stringify({
        version: CATEGORY_MATCH_VERSION,
        attempted,
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}
