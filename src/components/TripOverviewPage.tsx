"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  applyAddOverviewItem,
  applyDeleteOverviewItem,
  applyReorderOverviewItems,
  applyUpdateOverviewItem,
  formatTripPeriod,
  getTripById,
  getTripDuration,
  listTripDates,
  saveLocalTrip,
} from "@/lib/trips";
import type { OverviewItem, Trip } from "@/types/trip";
import {
  loadSharedTrip,
  saveSharedTrip,
  SharedTripConflictError,
} from "@/lib/shared-trip-client";

type TripOverviewPageProps = {
  tripId: string;
  mode?: "local" | "shared";
};

const CONFLICT_MESSAGE =
  "일정이 다른 사용자에 의해 변경되었습니다. 최신 내용을 불러와 주세요.";

export function TripOverviewPage({
  tripId,
  mode = "local",
}: TripOverviewPageProps) {
  const isShared = mode === "shared";
  const tripHref = isShared ? `/trip/${tripId}` : `/trips/${tripId}`;
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const versionRef = useRef(1);
  const tripRef = useRef<Trip | null | undefined>(undefined);

  useEffect(() => {
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

  async function persistShared(next: Trip) {
    setSaveError("");
    try {
      const saved = await saveSharedTrip(tripId, next, versionRef.current);
      tripRef.current = saved.trip;
      setTrip(saved.trip);
      versionRef.current = saved.version;
    } catch (error) {
      if (error instanceof SharedTripConflictError) {
        tripRef.current = error.trip;
        setTrip(error.trip);
        versionRef.current = error.version;
        setSaveError(CONFLICT_MESSAGE);
        return;
      }
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "여행 개요를 저장하지 못했습니다.",
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
  const overview = trip.overview ?? [];

  return (
    <div className="min-h-dvh bg-[#F6F1E8] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-[#F6F1E8]/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Link
            href={tripHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-slate-700"
            aria-label="여행 상세로"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-teal-700">Trip Route</p>
            <p className="truncate text-base font-semibold tracking-tight">여행 개요</p>
          </div>
          <Link
            href={tripHref}
            className="inline-flex min-h-11 shrink-0 items-center rounded-2xl px-2 text-sm font-medium text-teal-800"
          >
            상세 일정
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-16 sm:pt-8">
        <section className="rounded-[1.75rem] bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
          <p className="text-sm font-medium text-teal-700">{trip.destination}</p>
          <h1 className="mt-1 break-keep text-2xl font-semibold tracking-tight sm:text-3xl">
            {trip.title}
          </h1>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            {formatTripPeriod(trip.startDate, trip.endDate)} ·{" "}
            {getTripDuration(trip.startDate, trip.endDate)}
          </p>
          {isShared ? (
            <p className="mt-2 text-xs font-medium text-teal-800">
              공유 일정 · 링크를 가진 사람은 개요를 편집할 수 있습니다.
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-3 text-sm font-medium text-red-600">{saveError}</p>
          ) : null}
          {isShared ? (
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 disabled:opacity-60"
            >
              {refreshing ? "불러오는 중..." : "변경사항 확인"}
            </button>
          ) : null}
        </section>

        <section className="mt-6 space-y-4 sm:mt-8">
          <h2 className="text-lg font-semibold tracking-tight">날짜별 개요</h2>
          {dates.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
              표시할 날짜가 없습니다.
            </div>
          ) : (
            dates.map((date, index) => (
              <OverviewDay
                key={date}
                date={date}
                dayNumber={index + 1}
                items={overview.filter((item) => item.date === date)}
                onAdd={(text) => {
                  commit((current) => applyAddOverviewItem(current, date, text));
                }}
                onUpdate={(itemId, text) => {
                  commit((current) => applyUpdateOverviewItem(current, itemId, text));
                }}
                onDelete={(itemId) => {
                  commit((current) => applyDeleteOverviewItem(current, itemId));
                }}
                onReorder={(orderedIds) => {
                  commit((current) =>
                    applyReorderOverviewItems(current, date, orderedIds),
                  );
                }}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}

function OverviewDay({
  date,
  dayNumber,
  items,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
}: {
  date: string;
  dayNumber: number;
  items: OverviewItem[];
  onAdd: (text: string) => void;
  onUpdate: (itemId: string, text: string) => void;
  onDelete: (itemId: string) => void;
  onReorder: (orderedItemIds: string[]) => void;
}) {
  const [list, setList] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [draft, setDraft] = useState("");
  const dateLabel = formatOverviewDate(date);

  useEffect(() => {
    setList(items);
  }, [items]);

  function moveItem(current: OverviewItem[], fromId: string, toId: string) {
    if (fromId === toId) {
      return current;
    }
    const fromIndex = current.findIndex((item) => item.id === fromId);
    const toIndex = current.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return current;
    }
    const next = [...current];
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

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setDraft("");
  }

  function saveEdit() {
    if (!editingId) {
      return;
    }
    onUpdate(editingId, editText);
    setEditingId(null);
    setEditText("");
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="min-w-0 py-1">
        <h3 className="text-base font-semibold tracking-tight">DAY {dayNumber}</h3>
        <p className="mt-1 text-xs text-slate-400">
          {dateLabel} · {date}
        </p>
      </div>

      {list.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-stone-50 px-4 py-5 text-sm text-slate-500">
          아직 작성한 개요가 없습니다.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {list.map((item) => (
            <li
              key={item.id}
              data-overview-id={item.id}
              draggable={editingId !== item.id}
              onDragStart={(event) => {
                if (isInteractiveTarget(event.target) || editingId === item.id) {
                  event.preventDefault();
                  return;
                }
                setDraggingId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData("text/plain") || draggingId;
                if (fromId) {
                  const next = moveItem(list, fromId, item.id);
                  setList(next);
                  onReorder(next.map((entry) => entry.id));
                }
                setDraggingId(null);
              }}
              onDragEnd={() => setDraggingId(null)}
              className={`min-w-0 rounded-2xl border border-stone-200 bg-stone-100 px-3 py-3 sm:px-4 ${
                draggingId === item.id ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <span
                  aria-label="순서 변경"
                  className="-ml-1 mt-0.5 flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-slate-400 active:cursor-grabbing"
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse" || editingId === item.id) {
                      return;
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingId(item.id);
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
                      ?.closest("[data-overview-id]")
                      ?.getAttribute("data-overview-id");
                    if (overId) {
                      setList((current) => moveItem(current, draggingId, overId));
                    }
                  }}
                  onPointerUp={() => {
                    if (draggingId) {
                      onReorder(list.map((entry) => entry.id));
                    }
                    setDraggingId(null);
                  }}
                >
                  <DragHandle />
                </span>
                <div className="min-w-0 flex-1">
                  {editingId === item.id ? (
                    <input
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveEdit();
                        }
                        if (event.key === "Escape") {
                          setEditingId(null);
                          setEditText("");
                        }
                      }}
                      className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
                    />
                  ) : (
                    <p className="break-keep py-2 font-medium leading-6 text-slate-900">
                      {item.text}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-start">
                  {editingId === item.id ? (
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-teal-800"
                    >
                      저장
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.text);
                      }}
                      className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-slate-400 hover:text-teal-800"
                    >
                      ✏️ 수정
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-slate-400 hover:text-red-600"
                  >
                    🗑️ 삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row" onSubmit={handleAdd}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="예: ✈️ 공항"
          className="min-h-11 min-w-0 w-full rounded-2xl border border-slate-200 bg-stone-50 px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white"
        >
          항목 추가
        </button>
      </form>
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

function formatOverviewDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
