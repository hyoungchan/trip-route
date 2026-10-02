import { NextRequest, NextResponse } from "next/server";
import { isValidLatLng } from "@/lib/google-routes";
import {
  NAVER_DIRECTIONS_URL,
  mapNaverDrivingRoute,
  naverCoordParam,
  naverRouteErrorMessage,
  type NaverDrivingResponse,
} from "@/lib/naver-directions";

export async function POST(request: NextRequest) {
  const keyId =
    process.env.NAVER_MAP_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();
  const key = process.env.NAVER_MAP_CLIENT_SECRET?.trim();

  if (!keyId || !key) {
    return NextResponse.json(
      {
        error:
          "네이버 Directions 5는 Maps 애플리케이션 Client ID/Secret이 필요합니다. 서버에 NAVER_MAP_CLIENT_SECRET을 설정하고, Client ID는 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID와 같은 Maps 앱을 사용해 주세요.",
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

  const origin =
    body && typeof body === "object" ? (body as { origin?: unknown }).origin : undefined;
  const destination =
    body && typeof body === "object"
      ? (body as { destination?: unknown }).destination
      : undefined;

  if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
    return NextResponse.json(
      { error: "origin과 destination의 lat, lng 좌표가 필요합니다." },
      { status: 400 },
    );
  }

  const url = new URL(NAVER_DIRECTIONS_URL);
  url.searchParams.set("start", naverCoordParam(origin));
  url.searchParams.set("goal", naverCoordParam(destination));
  url.searchParams.set("option", "traoptimal");

  console.info("[naver-routes] driving", {
    origin: { lat: roundCoord(origin.lat), lng: roundCoord(origin.lng) },
    destination: {
      lat: roundCoord(destination.lat),
      lng: roundCoord(destination.lng),
    },
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": keyId,
        "X-NCP-APIGW-API-KEY": key,
      },
      cache: "no-store",
    });
  } catch (error) {
    console.error("[naver-routes] request failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "네이버 Directions API에 연결하지 못했습니다." },
      { status: 502 },
    );
  }

  let data: NaverDrivingResponse;
  try {
    data = (await response.json()) as NaverDrivingResponse;
  } catch {
    console.error("[naver-routes] invalid JSON", { status: response.status });
    return NextResponse.json(
      { error: "네이버 Directions API 응답을 해석하지 못했습니다." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    console.error("[naver-routes] http error", {
      status: response.status,
      code: data.code,
      message: data.message,
    });
    return NextResponse.json(
      {
        error:
          "네이버 Directions API 요청이 실패했습니다. Maps 앱에 Directions 5 권한이 있는지 확인해 주세요.",
      },
      { status: 502 },
    );
  }

  if (data.code !== 0) {
    const message = naverRouteErrorMessage(data.code);
    console.info("[naver-routes] no route", { code: data.code, message: data.message });
    return NextResponse.json(
      { error: message ?? "네이버 자동차 경로를 찾지 못했습니다." },
      { status: 404 },
    );
  }

  const mapped = mapNaverDrivingRoute(data);
  if (!mapped.ok) {
    console.info("[naver-routes] invalid route", { code: data.code, reason: mapped.reason });
    return NextResponse.json(
      { error: "네이버 자동차 경로 응답을 해석하지 못했습니다." },
      { status: 502 },
    );
  }

  return NextResponse.json(mapped.route);
}

function roundCoord(value: number) {
  return Math.round(value * 10000) / 10000;
}
