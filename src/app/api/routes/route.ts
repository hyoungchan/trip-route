import { NextRequest, NextResponse } from "next/server";
import {
  googleErrorMessage,
  googleErrorStatus,
  googleLatLng,
  isGoogleTravelMode,
  isValidLatLng,
  mapGoogleRoute,
  parseAllowedTravelModes,
  routeMatchesAllowedTransit,
  type GoogleComputeRoutesResponse,
  type GoogleTravelMode,
} from "@/lib/google-routes";

const COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.transitDetails",
].join(",");

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "서버에 GOOGLE_MAPS_API_KEY를 설정한 뒤 개발 서버를 다시 시작해 주세요.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const origin = isRecord(body) ? body.origin : undefined;
  const destination = isRecord(body) ? body.destination : undefined;
  const requestedMode = isRecord(body) ? body.travelMode : undefined;
  const transitPreferences = isRecord(body) ? body.transitPreferences : undefined;
  const allowedTravelModesRaw =
    isRecord(transitPreferences) ? transitPreferences.allowedTravelModes : undefined;
  const parsedAllowed = parseAllowedTravelModes(allowedTravelModesRaw);

  if (requestedMode != null && !isGoogleTravelMode(requestedMode)) {
    return NextResponse.json(
      { error: "travelMode는 DRIVE, WALK, TRANSIT 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  if (!parsedAllowed.ok) {
    return NextResponse.json(
      { error: "transitPreferences.allowedTravelModes는 BUS 또는 SUBWAY여야 합니다." },
      { status: 400 },
    );
  }

  const travelMode: GoogleTravelMode = isGoogleTravelMode(requestedMode)
    ? requestedMode
    : "DRIVE";

  if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
    return NextResponse.json(
      { error: "origin과 destination의 lat, lng 좌표가 필요합니다." },
      { status: 400 },
    );
  }

  const googleBody: Record<string, unknown> = {
    origin: {
      location: {
        latLng: googleLatLng(origin),
      },
    },
    destination: {
      location: {
        latLng: googleLatLng(destination),
      },
    },
    travelMode,
    languageCode: "ko",
    regionCode: "KR",
    units: "METRIC",
  };

  if (travelMode === "DRIVE") {
    googleBody.routingPreference = "TRAFFIC_AWARE";
  }

  if (travelMode === "TRANSIT" && parsedAllowed.modes) {
    googleBody.transitPreferences = {
      allowedTravelModes: parsedAllowed.modes,
    };
  }

  console.info("[routes] computeRoutes", {
    travelMode,
    allowedTravelModes: parsedAllowed.modes,
    origin: { lat: roundCoord(origin.lat), lng: roundCoord(origin.lng) },
    destination: {
      lat: roundCoord(destination.lat),
      lng: roundCoord(destination.lng),
    },
  });

  let response: Response;
  try {
    response = await fetch(COMPUTE_ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(googleBody),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[routes] request failed", {
      travelMode,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Google Routes API에 연결하지 못했습니다." },
      { status: 502 },
    );
  }

  let data: GoogleComputeRoutesResponse;
  try {
    data = (await response.json()) as GoogleComputeRoutesResponse;
  } catch {
    console.error("[routes] invalid JSON", { status: response.status, travelMode });
    return NextResponse.json(
      { error: "Google Routes API 응답을 해석하지 못했습니다." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const status = googleErrorStatus(data);
    const message = googleErrorMessage(data);
    console.error("[routes] google error", {
      httpStatus: response.status,
      status,
      message,
      travelMode,
    });

    if (isUnsupportedMode(status, message, travelMode)) {
      return NextResponse.json(
        {
          error: `${travelMode} 이동수단은 이 구간에 지원되지 않습니다.`,
          googleStatus: status || undefined,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        error: "Google Routes API 요청이 실패했습니다.",
        googleStatus: status || undefined,
      },
      { status: 502 },
    );
  }

  const mapped = mapGoogleRoute(data, travelMode);
  if (!mapped.ok) {
    console.info("[routes] no route", {
      travelMode,
      allowedTravelModes: parsedAllowed.modes,
      reason: mapped.reason,
    });
    return NextResponse.json(
      { error: transitMissingMessage(parsedAllowed.modes) },
      { status: 404 },
    );
  }

  if (
    parsedAllowed.modes &&
    travelMode === "TRANSIT" &&
    !routeMatchesAllowedTransit(mapped.route, parsedAllowed.modes)
  ) {
    console.info("[routes] transit mode mismatch", {
      travelMode,
      allowedTravelModes: parsedAllowed.modes,
      vehicles: mapped.route.transit?.map((leg) => leg.vehicleType) ?? [],
    });
    return NextResponse.json(
      { error: transitMissingMessage(parsedAllowed.modes) },
      { status: 404 },
    );
  }

  return NextResponse.json(mapped.route);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function roundCoord(value: number) {
  return Math.round(value * 10000) / 10000;
}

function transitMissingMessage(allowed: string[] | null) {
  if (allowed?.length === 1 && allowed[0] === "BUS") {
    return "버스 경로를 찾지 못했습니다.";
  }
  if (allowed?.length === 1 && allowed[0] === "SUBWAY") {
    return "지하철 경로를 찾지 못했습니다.";
  }
  return "해당 구간의 경로를 찾지 못했습니다.";
}

function isUnsupportedMode(
  status: string,
  message: string,
  travelMode: GoogleTravelMode,
) {
  const text = `${status} ${message}`.toUpperCase();
  return (
    travelMode !== "DRIVE" &&
    (text.includes("TRAVELMODE") ||
      text.includes("TRAVEL_MODE") ||
      text.includes("UNSUPPORTED") ||
      status === "INVALID_ARGUMENT")
  );
}
