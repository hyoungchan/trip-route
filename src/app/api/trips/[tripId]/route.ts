import { NextRequest, NextResponse } from "next/server";
import { getDatabaseUrl } from "@/lib/db";
import { parseTrip } from "@/lib/parse-trip";
import { getSharedTrip, isShareId, updateSharedTrip } from "@/lib/shared-trips";

function dbUnavailable() {
  return NextResponse.json(
    {
      error:
        "공유 일정을 불러올 수 없습니다. 서버에 DATABASE_URL을 설정한 뒤 다시 배포해 주세요.",
    },
    { status: 503 },
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  if (!getDatabaseUrl()) {
    return dbUnavailable();
  }

  const { tripId } = await context.params;
  if (!isShareId(tripId)) {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const record = await getSharedTrip(tripId);
    if (!record) {
      return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({
      id: record.id,
      trip: record.trip,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_UNAVAILABLE") {
      return dbUnavailable();
    }
    console.error("[api/trips] get failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "공유 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tripId: string }> },
) {
  if (!getDatabaseUrl()) {
    return dbUnavailable();
  }

  const { tripId } = await context.params;
  if (!isShareId(tripId)) {
    return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const trip = parseTrip(payload.trip);
  const version =
    typeof payload.version === "number" && Number.isInteger(payload.version)
      ? payload.version
      : null;
  if (!trip || version == null || version < 1) {
    return NextResponse.json({ error: "일정 데이터가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const result = await updateSharedTrip(tripId, trip, version);
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!result.ok && result.reason === "conflict" && result.record) {
      return NextResponse.json(
        {
          error: "일정이 다른 사용자에 의해 변경되었습니다. 최신 내용을 불러와 주세요.",
          trip: result.record.trip,
          version: result.record.version,
          updatedAt: result.record.updatedAt,
        },
        { status: 409 },
      );
    }
    if (!result.ok || !result.record) {
      return NextResponse.json(
        { error: "일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
    return NextResponse.json({
      id: result.record.id,
      trip: result.record.trip,
      version: result.record.version,
      updatedAt: result.record.updatedAt,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "DATABASE_UNAVAILABLE") {
      return dbUnavailable();
    }
    if (code === "TRIP_TOO_LARGE") {
      return NextResponse.json(
        { error: "일정이 너무 커서 저장할 수 없습니다." },
        { status: 413 },
      );
    }
    console.error("[api/trips] patch failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "일정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
