const SCRIPT_ID = "naver-maps-sdk";

export function getNaverMapClientId() {
  return process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ?? "";
}

let loading: Promise<void> | null = null;

export function loadNaverMaps(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("WINDOW_UNAVAILABLE"));
  }

  if (window.naver?.maps) {
    return Promise.resolve();
  }

  if (loading) {
    return loading;
  }

  const clientId = getNaverMapClientId();
  if (!clientId) {
    return Promise.reject(new Error("NO_CLIENT_ID"));
  }

  loading = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.naver?.maps) {
      resolve();
      return;
    }

    const callbackName = `__initNaverMaps_${Date.now()}`;
    const timeout = window.setTimeout(() => {
      cleanup();
      loading = null;
      reject(new Error("LOAD_TIMEOUT"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete (window as unknown as Record<string, unknown>)[callbackName];
    }

    function succeed() {
      cleanup();
      if (window.naver?.maps) {
        resolve();
        return;
      }
      loading = null;
      reject(new Error("SDK_MISSING"));
    }

    (window as unknown as Record<string, unknown>)[callbackName] = succeed;

    if (existing) {
      if (window.naver?.maps) {
        succeed();
        return;
      }
      const readyState = (existing as HTMLScriptElement & { readyState?: string })
        .readyState;
      if (readyState === "complete") {
        existing.remove();
      } else {
        existing.addEventListener(
          "load",
          () => {
            if (window.naver?.maps) {
              succeed();
            }
          },
          { once: true },
        );
        existing.addEventListener(
          "error",
          () => {
            cleanup();
            loading = null;
            reject(new Error("LOAD_FAILED"));
          },
          { once: true },
        );
        return;
      }
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
      clientId,
    )}&submodules=geocoder&callback=${callbackName}`;
    script.onerror = () => {
      cleanup();
      loading = null;
      reject(new Error("LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });

  return loading;
}

export function geocodeAddress(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    const service = window.naver?.maps?.Service;
    if (!service?.geocode) {
      resolve(null);
      return;
    }

    service.geocode({ query: address }, (status, response) => {
      if (status !== service.Status.OK || !response?.v2?.addresses?.[0]) {
        resolve(null);
        return;
      }

      const item = response.v2.addresses[0];
      const longitude = Number(item.x);
      const latitude = Number(item.y);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        resolve(null);
        return;
      }

      resolve({ latitude, longitude });
    });
  });
}

export type PlaceSearchResult = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category?: string;
};

type SearchApiPlace = {
  name: string;
  address: string;
  category?: string;
  mapx: string;
  mapy: string;
};

function isWgs84(longitude: number, latitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 24 &&
    latitude <= 46 &&
    longitude >= 120 &&
    longitude <= 150
  );
}

function toLatLng(mapx: string, mapy: string): { latitude: number; longitude: number } | null {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  if (isWgs84(x, y)) {
    return { latitude: y, longitude: x };
  }

  const scaledLng = x / 1e7;
  const scaledLat = y / 1e7;
  if (isWgs84(scaledLng, scaledLat)) {
    return { latitude: scaledLat, longitude: scaledLng };
  }

  const transCoord = window.naver?.maps?.TransCoord;
  if (!transCoord?.fromTM128ToLatLng) {
    return null;
  }

  const latlng = transCoord.fromTM128ToLatLng(new window.naver.maps.Point(x, y));
  const latitude = latlng.lat();
  const longitude = latlng.lng();
  if (!isWgs84(longitude, latitude)) {
    return null;
  }

  return { latitude, longitude };
}

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const response = await fetch(`/api/places/search?query=${encodeURIComponent(trimmed)}`);
  const data = (await response.json()) as { places?: SearchApiPlace[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "SEARCH_FAILED");
  }

  await loadNaverMaps();

  const places: PlaceSearchResult[] = [];
  for (const place of data.places ?? []) {
    const coords = toLatLng(place.mapx, place.mapy);
    if (!coords) {
      continue;
    }
    places.push({
      name: place.name,
      address: place.address,
      ...(place.category ? { category: place.category } : {}),
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  }
  return places;
}
