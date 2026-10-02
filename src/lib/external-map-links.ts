export type ExternalMapPlace = {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export function createNaverRouteUrl(
  origin: ExternalMapPlace,
  destination: ExternalMapPlace,
): string | null {
  if (!hasMapCoordinates(origin) || !hasMapCoordinates(destination)) {
    return null;
  }

  const start = naverDirectionPoint(origin);
  const goal = naverDirectionPoint(destination);
  return `https://map.naver.com/p/directions/${start}/${goal}/-/car`;
}

export function createGoogleTransitUrl(
  origin: ExternalMapPlace,
  destination: ExternalMapPlace,
): string | null {
  if (!hasMapCoordinates(origin) || !hasMapCoordinates(destination)) {
    return null;
  }

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set(
    "destination",
    `${destination.latitude},${destination.longitude}`,
  );
  url.searchParams.set("travelmode", "transit");
  return url.toString();
}

export function createExternalRouteUrl(
  travelMode: string | undefined,
  origin: ExternalMapPlace,
  destination: ExternalMapPlace,
): string | null {
  if (travelMode === "drive") {
    return createNaverRouteUrl(origin, destination);
  }
  if (travelMode === "bus" || travelMode === "subway") {
    return createGoogleTransitUrl(origin, destination);
  }
  return null;
}

export function createNaverPlaceWebUrl(place: ExternalMapPlace): string | null {
  const query = placeQuery(place);
  if (hasMapCoordinates(place)) {
    const label = encodeURIComponent(query || `${place.latitude},${place.longitude}`);
    return `https://map.naver.com/p/search/${label}?c=${place.longitude},${place.latitude},16,0,0,0,dh`;
  }
  if (!query) {
    return null;
  }
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export function createNaverPlaceAppUrl(place: ExternalMapPlace): string | null {
  if (!hasMapCoordinates(place)) {
    return null;
  }
  const name = encodeURIComponent(placeQuery(place) || "장소");
  return `nmap://place?lat=${place.latitude}&lng=${place.longitude}&name=${name}&appname=trip-route`;
}

export function openNaverPlaceMap(place: ExternalMapPlace) {
  const webUrl = createNaverPlaceWebUrl(place);
  const appUrl = createNaverPlaceAppUrl(place);
  if (!webUrl) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  if (isLikelyMobileDevice() && appUrl) {
    const startedAt = Date.now();
    const fallback = () => {
      if (document.visibilityState !== "visible" || Date.now() - startedAt > 2500) {
        return;
      }
      window.location.href = webUrl;
    };
    window.setTimeout(fallback, 1200);
    window.location.href = appUrl;
    return;
  }

  window.open(webUrl, "_blank", "noopener,noreferrer");
}

function placeQuery(place: ExternalMapPlace) {
  return place.name?.trim() || place.address?.trim() || "";
}

function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function hasMapCoordinates(
  place: ExternalMapPlace,
): place is ExternalMapPlace & { latitude: number; longitude: number } {
  return (
    typeof place.latitude === "number" &&
    Number.isFinite(place.latitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.longitude) &&
    place.longitude >= -180 &&
    place.longitude <= 180
  );
}

function naverDirectionPoint(
  place: ExternalMapPlace & { latitude: number; longitude: number },
) {
  const name = place.name?.trim() || `${place.latitude},${place.longitude}`;
  return `${place.longitude},${place.latitude},${encodeURIComponent(name)}`;
}
