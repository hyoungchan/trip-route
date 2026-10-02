"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  applyDeletePlaceFromTrip,
  applyReorderDayPlaces,
  applyUpdateDayStartTime,
  applyUpdatePlaceCoordinates,
  applyUpdatePlaceDrivingTravel,
  applyUpdatePlaceStayMinutes,
  applyUpdatePlaceTransitTravel,
  applyUpdatePlaceTravelMinutes,
  applyUpdatePlaceWalkTravel,
  formatDayLabel,
  formatTripPeriod,
  getTripById,
  getTripDuration,
  listTripDates,
  saveLocalTrip,
} from "@/lib/trips";
import { ShareTripControls } from "./ShareTripControls";
import { emojiForPlace, isNoStayPlace } from "@/lib/place-category";
import { backfillMissingPlaceCategories } from "@/lib/place-category-backfill";
import {
  DEFAULT_DAY_START_TIME,
  buildDayTimeSlots,
  formatClockLabel,
  formatStayLabel,
  normalizeClockTime,
} from "@/lib/timetable";
import { createExternalRouteUrl } from "@/lib/external-map-links";
import {
  formatTransitLegLabel,
  formatTransitRouteStepLabel,
  formatTransitTravelLabel,
  isTransitTravelMode,
} from "@/lib/travel-transit";
import type { Place, Trip } from "@/types/trip";
import {
  loadSharedTrip,
  saveSharedTrip,
  SharedTripConflictError,
} from "@/lib/shared-trip-client";
import { StayDurationField } from "./StayDurationField";
import {
  TravelDurationField,
  formatDrivingTravelLabel,
  formatManualTravelLabel,
  formatWalkTravelLabel,
} from "./TravelDurationField";
import { TripMap } from "./TripMap";

type TripDetailPageProps = {
  tripId: string;
  mode?: "local" | "shared";
};

const COLLAPSED_DATES_STORAGE_KEY = "trip-route.ui.collapsedDates";
const CONFLICT_MESSAGE =
  "일정이 다른 사용자에 의해 변경되었습니다. 최신 내용을 불러와 주세요.";

export function TripDetailPage({ tripId, mode = "local" }: TripDetailPageProps) {
  const isShared = mode === "shared";
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [version, setVersion] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const versionRef = useRef(1);
  const tripRef = useRef<Trip | null | undefined>(undefined);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>(
    () => loadCollapsedDates(tripId),
  );
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null);

  useEffect(() => {
    const placeId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("place");
    setFocusPlaceId(placeId);
    setCollapsedDates(loadCollapsedDates(tripId));
    setSaveError("");
    setLoadError("");

    if (!isShared) {
      const loaded = getTripById(tripId);
      tripRef.current = loaded;
      setTrip(loaded);
      return;
    }

    let cancelled = false;
    setTrip(undefined);
    loadSharedTrip(tripId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result) {
          tripRef.current = null;
          setTrip(null);
          return;
        }
        tripRef.current = result.trip;
        setTrip(result.trip);
        setVersion(result.version);
        versionRef.current = result.version;
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        tripRef.current = null;
        setTrip(null);
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : "공유 일정을 불러오지 못했습니다.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, isShared]);

  useEffect(() => {
    if (isShared) {
      return;
    }
    let cancelled = false;
    backfillMissingPlaceCategories(tripId)
      .then((result) => {
        if (cancelled || !result) {
          return;
        }
        tripRef.current = result.trip;
        setTrip(result.trip);
      })
      .catch(() => {
        // keep the already-loaded trip if backfill fails
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, isShared]);

  useEffect(() => {
    if (!trip || !focusPlaceId) {
      return;
    }

    const focused = (trip.places ?? []).find((place) => place.id === focusPlaceId);
    if (!focused) {
      setFocusPlaceId(null);
      clearPlaceQuery();
      return;
    }

    if (collapsedDates[focused.date] === true) {
      setCollapsedDates((current) => {
        const next = { ...current, [focused.date]: false };
        writeCollapsedDates(tripId, next);
        return next;
      });
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const tryScroll = () => {
      if (cancelled) {
        return;
      }
      const el = document.querySelector(
        `[data-place-id="${CSS.escape(focusPlaceId)}"]`,
      );
      if (!(el instanceof HTMLElement)) {
        attempts += 1;
        if (attempts < maxAttempts) {
          requestAnimationFrame(tryScroll);
        } else {
          setFocusPlaceId(null);
          clearPlaceQuery();
        }
        return;
      }
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      setFocusPlaceId(null);
      clearPlaceQuery();
    };

    const frame = requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [trip, focusPlaceId, collapsedDates, tripId]);

  async function persistShared(next: Trip) {
    setSaveError("");
    try {
      const saved = await saveSharedTrip(tripId, next, versionRef.current);
      tripRef.current = saved.trip;
      setTrip(saved.trip);
      setVersion(saved.version);
      versionRef.current = saved.version;
    } catch (error) {
      if (error instanceof SharedTripConflictError) {
        tripRef.current = error.trip;
        setTrip(error.trip);
        setVersion(error.version);
        versionRef.current = error.version;
        setSaveError(CONFLICT_MESSAGE);
        return;
      }
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "일정을 저장하지 못했습니다.",
      );
    }
  }

  function commit(mutate: (current: Trip) => Trip | null) {
    const current = tripRef.current;
    if (!current) {
      return;
    }
    const next = mutate(current);
    if (!next) {
      return;
    }
    tripRef.current = next;
    setTrip(next);
    if (isShared) {
      void persistShared(next);
      return;
    }
    const saved = saveLocalTrip(next);
    if (saved) {
      tripRef.current = saved;
      setTrip(saved);
    }
  }

  async function handleRefresh() {
    if (!isShared) {
      return;
    }
    setRefreshing(true);
    setSaveError("");
    try {
      const result = await loadSharedTrip(tripId);
      if (!result) {
        tripRef.current = null;
        setTrip(null);
        return;
      }
      tripRef.current = result.trip;
      setTrip(result.trip);
      setVersion(result.version);
      versionRef.current = result.version;
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "최신 일정을 불러오지 못했습니다.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (trip === undefined) {
    return (
      <div className="min-h-dvh bg-[#F6F1E8] px-4 py-16 text-center text-slate-500">
        여행을 불러오는 중...
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-dvh bg-[#F6F1E8] px-4 py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">여행을 찾을 수 없어요</p>
        {loadError ? <p className="mt-2 text-sm text-slate-500">{loadError}</p> : null}
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-teal-700">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const dates = listTripDates(trip.startDate, trip.endDate);
  const places = trip.places ?? [];

  return (
    <div className="min-h-dvh bg-[#F6F1E8] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-[#F6F1E8]/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:h-16 sm:px-6 lg:max-w-6xl">
          <Link
            href="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-slate-700"
            aria-label="여행 목록으로"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium text-teal-700">Trip Route</p>
            <p className="truncate text-base font-semibold tracking-tight">여행 상세</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-16 sm:pt-8 lg:max-w-6xl">
        <section className="rounded-[1.75rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
          <p className="text-sm font-medium text-teal-700">{trip.destination}</p>
          <h1 className="mt-1 break-keep text-2xl font-semibold tracking-tight sm:text-3xl">
            {trip.title}
          </h1>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            {formatTripPeriod(trip.startDate, trip.endDate)} ·{" "}
            {getTripDuration(trip.startDate, trip.endDate)}
          </p>
          <p className="mt-2 text-sm text-slate-400">장소 {places.length}곳</p>
          {saveError ? (
            <p className="mt-3 text-sm font-medium text-red-600">{saveError}</p>
          ) : null}
          <ShareTripControls
            trip={trip}
            mode={mode}
            onRefresh={isShared ? () => void handleRefresh() : undefined}
            refreshing={refreshing}
          />
        </section>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:mt-8 lg:grid-cols-[minmax(20rem,1.1fr)_minmax(22rem,0.9fr)]">
          <div className="min-w-0">
            <div className="lg:sticky lg:top-20 lg:z-10">
            <TripMap
            places={dates.flatMap((date) =>
              places.filter((place) => place.date === date),
            )}
            onCoordinatesResolved={(updates) => {
              commit((current) => applyUpdatePlaceCoordinates(current, updates));
            }}
          />
            </div>
          </div>

          <section className="min-w-0 space-y-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 className="text-lg font-semibold tracking-tight">날짜별 일정</h2>
              {dates.length > 0 ? (
                <div className="flex items-center gap-1 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Object.fromEntries(
                        dates.map((date) => [date, true]),
                      );
                      setCollapsedDates(next);
                      writeCollapsedDates(tripId, next);
                    }}
                    className="inline-flex min-h-11 items-center px-2 text-slate-500 hover:text-teal-800"
                  >
                    전체 접기
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    |
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsedDates({});
                      writeCollapsedDates(tripId, {});
                    }}
                    className="inline-flex min-h-11 items-center px-2 text-slate-500 hover:text-teal-800"
                  >
                    전체 펼치기
                  </button>
                </div>
              ) : null}
            </div>
            {dates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
                표시할 날짜가 없습니다.
              </div>
            ) : (
              dates.map((date, index) => (
                <DaySchedule
                  key={date}
                  date={date}
                  label={formatDayLabel(date, index)}
                  startTime={trip.dayStartTimes?.[date]}
                  places={places.filter((place) => place.date === date)}
                  addHref={
                    isShared
                      ? `/trip/${trip.id}/days/${date}/places/new`
                      : `/trips/${trip.id}/days/${date}/places/new`
                  }
                  editHrefBase={
                    isShared
                      ? `/trip/${trip.id}/days/${date}/places`
                      : `/trips/${trip.id}/days/${date}/places`
                  }
                  expanded={collapsedDates[date] !== true}
                  onToggle={() => {
                    setCollapsedDates((current) => {
                      const next = {
                        ...current,
                        [date]: current[date] !== true,
                      };
                      writeCollapsedDates(tripId, next);
                      return next;
                    });
                  }}
                  onStartTimeChange={(time) => {
                    commit((current) => applyUpdateDayStartTime(current, date, time));
                  }}
                  onStayChange={(placeId, stayMinutes) => {
                    commit((current) =>
                      applyUpdatePlaceStayMinutes(current, placeId, stayMinutes),
                    );
                  }}
                  onTravelChange={(placeId, travelMinutes) => {
                    commit((current) =>
                      applyUpdatePlaceTravelMinutes(current, placeId, travelMinutes),
                    );
                  }}
                  onWalkTravelChange={(placeId, travelMinutes) => {
                    commit((current) =>
                      applyUpdatePlaceWalkTravel(current, placeId, travelMinutes),
                    );
                  }}
                  onDriveTravelChange={(placeId, durationMinutes, distanceKm) => {
                    commit((current) =>
                      applyUpdatePlaceDrivingTravel(
                        current,
                        placeId,
                        durationMinutes,
                        distanceKm,
                      ),
                    );
                  }}
                  onTransitTravelChange={(placeId, result) => {
                    commit((current) =>
                      applyUpdatePlaceTransitTravel(current, placeId, {
                        travelMode: result.travelMode,
                        travelMinutesToNext: result.durationMinutes,
                        distanceKm: result.distanceKm,
                        transit: result.transit,
                        steps: result.steps,
                      }),
                    );
                  }}
                  onDelete={(placeId) => {
                    commit((current) => applyDeletePlaceFromTrip(current, placeId));
                  }}
                  onReorder={(orderedIds) => {
                    commit((current) =>
                      applyReorderDayPlaces(current, date, orderedIds),
                    );
                  }}
                />
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function DaySchedule({
  date,
  label,
  startTime,
  places,
  addHref,
  editHrefBase,
  expanded,
  onToggle,
  onStartTimeChange,
  onStayChange,
  onTravelChange,
  onWalkTravelChange,
  onDriveTravelChange,
  onTransitTravelChange,
  onDelete,
  onReorder,
}: {
  date: string;
  label: string;
  startTime?: string;
  places: Place[];
  addHref: string;
  editHrefBase: string;
  expanded: boolean;
  onToggle: () => void;
  onStartTimeChange: (startTime: string) => void;
  onStayChange: (placeId: string, stayMinutes: number) => void;
  onTravelChange: (placeId: string, travelMinutes: number) => void;
  onWalkTravelChange: (placeId: string, travelMinutes: number) => void;
  onDriveTravelChange: (
    placeId: string,
    durationMinutes: number,
    distanceKm: number,
  ) => void;
  onTransitTravelChange: (
    placeId: string,
    result: {
      travelMode: "bus" | "subway";
      durationMinutes: number;
      distanceKm: number;
      transit: Place["travelTransit"];
      steps: Place["travelTransitSteps"];
    },
  ) => void;
  onDelete: (placeId: string) => void;
  onReorder: (orderedPlaceIds: string[]) => void;
}) {
  const [items, setItems] = useState(places);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dayStart = normalizeClockTime(startTime);
  const slots = buildDayTimeSlots(items, dayStart);
  const slotById = new Map(slots.map((slot) => [slot.placeId, slot]));

  useEffect(() => {
    setItems(places);
  }, [places]);

  function moveItem(list: Place[], fromId: string, toId: string) {
    if (fromId === toId) {
      return list;
    }

    const fromIndex = list.findIndex((place) => place.id === fromId);
    const toIndex = list.findIndex((place) => place.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return list;
    }

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function isInteractiveTarget(target: EventTarget | null) {
    return Boolean(
      (target as HTMLElement | null)?.closest(
        "button, input, select, textarea, label, a",
      ),
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? `${label} 일정 접기` : `${label} 일정 펼치기`}
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-2xl px-1 text-left hover:bg-stone-50"
      >
        <div className="min-w-0 flex-1 py-1">
          <h3 className="break-keep text-base font-semibold tracking-tight">{label}</h3>
          <p className="mt-1 text-xs text-slate-400">{date}</p>
        </div>
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm text-slate-400"
        >
          {expanded ? "▲" : "▶"}
        </span>
      </button>

      {expanded ? (
        <>
      <label className="mt-4 flex min-w-0 flex-col gap-1.5 sm:max-w-xs">
        <span className="text-sm font-medium text-slate-700">첫 일정 시작</span>
        <input
          type="time"
          value={dayStart}
          onChange={(event) => {
            const next = event.target.value || DEFAULT_DAY_START_TIME;
            onStartTimeChange(next);
          }}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-stone-50 px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
        />
      </label>
      <p className="mt-1.5 text-xs leading-5 text-slate-400">
        체류시간과 이동시간을 반영합니다. 자동차·버스·지하철은 경로로 계산합니다.
      </p>

      {items.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-stone-50 px-4 py-5 text-sm text-slate-500">
          아직 추가한 장소가 없습니다.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {items.map((place, index) => {
            const slot = slotById.get(place.id);
            const destination = items[index + 1];
            const nextArrival =
              slot && destination
                ? slot.endMinutes + slot.travelMinutesToNext
                : null;
            const mapUrl = destination
              ? createExternalRouteUrl(place.travelMode, place, destination)
              : null;
            const hasTransitSteps =
              isTransitTravelMode(place.travelMode) &&
              (place.travelTransitSteps?.length ?? 0) > 0;
            const hasTransitLegs =
              !hasTransitSteps &&
              isTransitTravelMode(place.travelMode) &&
              (place.travelTransit?.length ?? 0) > 0;
            return (
              <Fragment key={place.id}>
              <li
                data-place-id={place.id}
                draggable
                onDragStart={(event) => {
                  if (isInteractiveTarget(event.target)) {
                    event.preventDefault();
                    return;
                  }
                  setDraggingId(place.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", place.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromId =
                    event.dataTransfer.getData("text/plain") || draggingId;
                  if (fromId) {
                    const next = moveItem(items, fromId, place.id);
                    setItems(next);
                    onReorder(next.map((item) => item.id));
                  }
                  setDraggingId(null);
                }}
                onDragEnd={() => setDraggingId(null)}
                className={`scroll-mt-20 min-w-0 rounded-2xl border border-stone-200 bg-stone-100 px-3 py-3 sm:px-4 ${
                  draggingId === place.id ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span
                    aria-label={`${place.name} 순서 변경`}
                    className="-ml-1 mt-0.5 flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-slate-400 active:cursor-grabbing"
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") {
                        return;
                      }
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingId(place.id);
                    }}
                    onPointerMove={(event) => {
                      if (event.pointerType === "mouse" || !draggingId) {
                        return;
                      }
                      const target = document.elementFromPoint(
                        event.clientX,
                        event.clientY,
                      );
                      const overId = target
                        ?.closest("[data-place-id]")
                        ?.getAttribute("data-place-id");
                      if (overId) {
                        setItems((current) => moveItem(current, draggingId, overId));
                      }
                    }}
                    onPointerUp={() => {
                      if (draggingId) {
                        onReorder(items.map((item) => item.id));
                      }
                      setDraggingId(null);
                    }}
                  >
                    <DragHandle />
                  </span>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-keep font-medium text-slate-900">
                      <span className="mr-1" aria-hidden="true">
                        {emojiForPlace(place)}
                      </span>{" "}
                      {place.name}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-slate-500">
                      {place.address}
                    </p>
                    {slot ? (
                      <p className="mt-2 text-sm font-medium text-teal-800">
                        {isNoStayPlace(place) || slot.stayMinutes === 0
                          ? formatClockLabel(slot.startMinutes)
                          : `${formatClockLabel(slot.startMinutes)} – ${formatClockLabel(slot.endMinutes)}`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start">
                    <Link
                      href={`${editHrefBase}/${place.id}/edit`}
                      className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-slate-400 hover:text-teal-800"
                    >
                      ✏️ 수정
                    </Link>
                    <button
                      type="button"
                      data-delete
                      onClick={() => onDelete(place.id)}
                      className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-slate-400 hover:text-red-600"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
                {isNoStayPlace(place) ? null : (
                <div className="mt-3 min-w-0 pl-12 sm:pl-14">
                  <span className="mb-1.5 block text-xs font-medium text-slate-500">
                    체류시간
                  </span>
                  <StayDurationField
                    value={place.stayMinutes}
                    onChange={(stayMinutes) => onStayChange(place.id, stayMinutes)}
                  />
                </div>
                )}
              </li>
              {slot && nextArrival != null ? (
                <li className="rounded-2xl border border-dashed border-teal-200/80 bg-stone-50 px-3 py-3 sm:px-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
                    <span aria-hidden="true">↓</span>
                    <span>다음 장소로 이동</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-teal-800/80">
                    {place.travelMode === "drive"
                      ? `${formatDrivingTravelLabel(slot.travelMinutesToNext, place.travelDistanceKm)} · 다음 시작 ${formatClockLabel(nextArrival)}`
                      : isTransitTravelMode(place.travelMode)
                        ? `${formatTransitTravelLabel(formatStayLabel(slot.travelMinutesToNext), place.travelDistanceKm, place.travelTransit, place.travelMode)} · 다음 시작 ${formatClockLabel(nextArrival)}`
                        : place.travelMode === "walk"
                          ? `${formatWalkTravelLabel(slot.travelMinutesToNext)} · 다음 시작 ${formatClockLabel(nextArrival)}`
                        : `${formatManualTravelLabel(slot.travelMinutesToNext)} · 다음 시작 ${formatClockLabel(nextArrival)}`}
                  </p>
                  {(hasTransitSteps || hasTransitLegs || mapUrl) ? (
                      <div className="mt-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3">
                          {hasTransitSteps ? (
                            <details>
                              <summary className="cursor-pointer select-none text-xs font-medium text-teal-800/90">
                                상세 경로
                              </summary>
                              <ul className="mt-1.5 space-y-1 text-xs leading-5 text-teal-800/80">
                                {place.travelTransitSteps?.map((step, stepIndex) => (
                                  <li key={`${place.id}-step-${stepIndex}`}>
                                    {formatTransitRouteStepLabel(step, {
                                      originName: place.name,
                                      destinationName: destination?.name,
                                      index: stepIndex,
                                      total: place.travelTransitSteps?.length ?? 0,
                                    })}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center text-xs font-medium text-teal-800/90 hover:text-teal-950"
                            >
                              지도에서 보기 ↗
                            </a>
                          ) : null}
                        </div>
                        {hasTransitLegs ? (
                          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-teal-800/80">
                            {place.travelTransit?.map((leg, legIndex) => (
                              <li key={`${place.id}-transit-${legIndex}`}>
                                {formatTransitLegLabel(leg)}
                                {typeof leg.stopCount === "number"
                                  ? ` · ${leg.stopCount}정거장`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  <div className="mt-3 min-w-0">
                    <span className="mb-1.5 block text-xs font-medium text-slate-500">
                      이동시간
                    </span>
                    <TravelDurationField
                      value={place.travelMinutesToNext}
                      travelMode={place.travelMode}
                      distanceKm={place.travelDistanceKm}
                      origin={place}
                      destination={destination}
                      onChange={(travelMinutes) =>
                        onTravelChange(place.id, travelMinutes)
                      }
                      onWalkChange={(travelMinutes) =>
                        onWalkTravelChange(place.id, travelMinutes)
                      }
                      onDriveApply={({ durationMinutes, distanceKm }) =>
                        onDriveTravelChange(place.id, durationMinutes, distanceKm)
                      }
                      onTransitApply={(result) =>
                        onTransitTravelChange(place.id, result)
                      }
                    />
                  </div>
                </li>
              ) : null}
              </Fragment>
            );
          })}
        </ol>
      )}
          <Link
            href={addHref}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white"
          >
            ＋ 장소 추가
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-medium text-slate-500 hover:bg-stone-50 hover:text-teal-800"
          >
            <span aria-hidden="true">▲</span>
            일정 접기
          </button>
        </>
      ) : null}
    </section>
  );
}

function DragHandle() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

function loadCollapsedDates(tripId: string): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(COLLAPSED_DATES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const forTrip = (parsed as Record<string, unknown>)[tripId];
    if (!forTrip || typeof forTrip !== "object") {
      return {};
    }
    const next: Record<string, boolean> = {};
    for (const [date, collapsed] of Object.entries(forTrip)) {
      if (collapsed === true) {
        next[date] = true;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function clearPlaceQuery() {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has("place")) {
    return;
  }
  url.searchParams.delete("place");
  const query = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}

function writeCollapsedDates(tripId: string, next: Record<string, boolean>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = window.localStorage.getItem(COLLAPSED_DATES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    const store =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    window.localStorage.setItem(
      COLLAPSED_DATES_STORAGE_KEY,
      JSON.stringify({ ...store, [tripId]: next }),
    );
  } catch {
    // UI-only persistence; ignore storage failures.
  }
}
