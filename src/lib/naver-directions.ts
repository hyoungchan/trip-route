import type { RouteLatLng } from "@/lib/google-routes";

export const NAVER_DIRECTIONS_URL =
  "https://maps.apigw.ntruss.com/map-direction/v1/driving";

type NaverRouteSummary = {
  distance?: number;
  duration?: number;
};

type NaverDrivingResponse = {
  code?: number;
  message?: string;
  route?: {
    traoptimal?: Array<{
      summary?: NaverRouteSummary;
    }>;
  };
};

export type NaverDrivingRoute = {
  durationSeconds: number;
  durationMinutes: number;
  distanceMeters: number;
  distanceKm: number;
};

const NAVER_ROUTE_ERRORS: Record<number, string> = {
  1: "출발지와 도착지가 같습니다.",
  2: "출발지 또는 도착지가 도로 주변이 아닙니다.",
  3: "자동차 경로를 제공할 수 없습니다.",
  4: "경유지가 도로 주변이 아닙니다.",
  5: "경로 거리가 너무 길어 조회할 수 없습니다.",
};

export function naverCoordParam(point: RouteLatLng) {
  return `${point.lng},${point.lat}`;
}

export function naverRouteErrorMessage(code: number | undefined): string | null {
  if (typeof code !== "number" || code === 0) {
    return null;
  }
  return NAVER_ROUTE_ERRORS[code] ?? "네이버 자동차 경로를 찾지 못했습니다.";
}

export function mapNaverDrivingRoute(
  data: NaverDrivingResponse,
):
  | { ok: true; route: NaverDrivingRoute }
  | { ok: false; reason: "no-route" | "invalid-response"; code?: number } {
  const summary = data.route?.traoptimal?.[0]?.summary;
  const durationMs = summary?.duration;
  const distanceMeters = summary?.distance;

  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    return { ok: false, reason: "invalid-response", code: data.code };
  }

  const durationSeconds = Math.round(durationMs / 1000);

  return {
    ok: true,
    route: {
      durationSeconds,
      durationMinutes:
        durationSeconds === 0 ? 0 : Math.max(1, Math.round(durationSeconds / 60)),
      distanceMeters: Math.round(distanceMeters),
      distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    },
  };
}

export type { NaverDrivingResponse };
