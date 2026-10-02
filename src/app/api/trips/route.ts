import { NextRequest, NextResponse } from "next/server";
import { getDatabaseUrl } from "@/lib/db";
import { parseTrip } from "@/lib/parse-trip";
import { insertSharedTrip } from "@/lib/shared-trips";

function dbUnavailable() {
  return NextResponse.json(
    {
      error:
        "공유 일정을 저장할 수 없습니다. 서버에 DATABASE_URL을 설정한 뒤 다시 배포해 주세요.",
    },
    { status: 503 },
  );
}

export async function POST(request: NextRequest) {
  if (!getDatabaseUrl()) {
    return dbUnavailable();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
  }

  const rawTrip =
    body && typeof body === "object"
      ? (body as { trip?: unknown }).trip
      : undefined;
  const trip = parseTrip(rawTrip);
  if (!trip) {
    return NextResponse.json({ error: "일정 데이터가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const record = await insertSharedTrip(trip);
    return NextResponse.json({
      id: record.id,
      trip: record.trip,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "DATABASE_UNAVAILABLE") {
      return dbUnavailable();
    }
    if (code === "TRIP_TOO_LARGE") {
      return NextResponse.json(
        { error: "일정이 너무 커서 공유할 수 없습니다." },
        { status: 413 },
      );
    }
    console.error("[api/trips] create failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "공유 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
