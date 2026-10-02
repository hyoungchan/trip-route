"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";
import {
  searchPlaces,
  type PlaceSearchResult,
} from "@/lib/naver-maps";
import {
  applyAddPlaceToTrip,
  applyUpdatePlaceInTrip,
  formatDayLabel,
  getTripById,
  hasCoordinates,
  listTripDates,
  normalizeIsoDate,
  saveLocalTrip,
} from "@/lib/trips";
import { DEFAULT_STAY_MINUTES } from "@/lib/timetable";
import { isNoStayPlace, placeKindOf } from "@/lib/place-category";
import {
  placeCoordinatesChanged,
  refreshAdjacentTravelTimes,
} from "@/lib/travel-refresh";
import {
  loadSharedTrip,
  saveSharedTrip,
  SharedTripConflictError,
} from "@/lib/shared-trip-client";
import type { Place, PlaceKind, Trip } from "@/types/trip";
import { StayDurationField } from "./StayDurationField";

const PLACE_KIND_OPTIONS: { value: PlaceKind; label: string }[] = [
  { value: "visit", label: "📌 일반 장소" },
  { value: "home", label: "🏢 집" },
  { value: "lodging", label: "🛏️ 숙소" },
  { value: "airport", label: "✈️ 공항" },
];

type SelectedPlace = {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  category?: string;
};

type AddPlacePageProps = {
  tripId: string;
  date: string;
  placeId?: string;
  mode?: "local" | "shared";
};

export function AddPlacePage({ tripId, date, placeId, mode = "local" }: AddPlacePageProps) {
  const router = useRouter();
  const titleId = useId();
  const isEdit = Boolean(placeId);
  const isShared = mode === "shared";
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<SelectedPlace | null>(null);
  const [selectedKind, setSelectedKind] = useState<PlaceKind>("visit");
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stayMinutes, setStayMinutes] = useState(DEFAULT_STAY_MINUTES);
  const [version, setVersion] = useState(1);

  useEffect(() => {
    if (!isShared) {
      const nextTrip = getTripById(tripId);
      setTrip(nextTrip);
      applyEditingPlace(nextTrip);
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
          setTrip(null);
          setEditingPlace(null);
          return;
        }
        setTrip(result.trip);
        setVersion(result.version);
        applyEditingPlace(result.trip);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setTrip(null);
        setEditingPlace(null);
        setError(
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "공유 일정을 불러오지 못했습니다.",
        );
      });
    return () => {
      cancelled = true;
    };

    function applyEditingPlace(nextTrip: Trip | null) {
      if (!placeId || !nextTrip) {
        setEditingPlace(null);
        return;
      }
      const place = (nextTrip.places ?? []).find((item) => item.id === placeId) ?? null;
      setEditingPlace(place);
      if (!place || normalizeIsoDate(place.date) !== normalizeIsoDate(date)) {
        return;
      }
      setSelected(placeToSelected(place));
      setSelectedKind(placeKindOf(place));
      setQuery(place.name);
      setStayMinutes(
        typeof place.stayMinutes === "number" && place.stayMinutes > 0
          ? place.stayMinutes
          : DEFAULT_STAY_MINUTES,
      );
    }
  }, [tripId, date, placeId, isShared]);

  if (trip === undefined) {
    return (
      <div className="min-h-dvh bg-[#F6F1E8] px-4 py-16 text-center text-slate-500">
        여행을 불러오는 중...
      </div>
    );
  }

  const dates = trip ? listTripDates(trip.startDate, trip.endDate) : [];
  const dayDate = normalizeIsoDate(decodeURIComponent(date));
  const dayIndex = dates.indexOf(dayDate);
  const tripHref = isShared ? `/trip/${tripId}` : `/trips/${tripId}`;

  if (
    !trip ||
    dayIndex < 0 ||
    (isEdit &&
      (!editingPlace || normalizeIsoDate(editingPlace.date) !== dayDate))
  ) {
    return (
      <div className="min-h-dvh bg-[#F6F1E8] px-4 py-16 text-center">
        <p className="text-lg font-semibold text-slate-800">일정을 찾을 수 없어요</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-teal-700">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const resolvedKind = selectedKind === "visit" ? undefined : selectedKind;
  const noStay = isNoStayPlace({
    kind: resolvedKind,
    category: selected?.category,
  });

  async function persistPlaceTrip(next: Trip): Promise<Trip | null> {
    if (!isShared) {
      const saved = saveLocalTrip(next);
      if (!saved) {
        setError("장소를 저장하지 못했습니다.");
        return null;
      }
      return saved;
    }
    try {
      const saved = await saveSharedTrip(tripId, next, version);
      setVersion(saved.version);
      setTrip(saved.trip);
      return saved.trip;
    } catch (persistError) {
      if (persistError instanceof SharedTripConflictError) {
        setTrip(persistError.trip);
        setVersion(persistError.version);
        setError("일정이 다른 사용자에 의해 변경되었습니다. 최신 내용을 불러와 주세요.");
        return null;
      }
      setError(
        persistError instanceof Error && persistError.message
          ? persistError.message
          : "장소를 저장하지 못했습니다.",
      );
      return null;
    }
  }

  async function handleSearch(event?: FormEvent) {
    event?.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setError("장소명을 입력해 주세요.");
      return;
    }

    setError("");
    if (!isEdit) {
      setSelected(null);
    }
    setIsSearching(true);
    setSearched(true);

    try {
      const nextResults = await searchPlaces(nextQuery);
      setResults(nextResults);
      if (nextResults.length === 0) {
        setError("검색 결과가 없습니다. 다른 장소명이나 주소를 입력해 보세요.");
      }
    } catch (error) {
      setResults([]);
      setError(
        error instanceof Error && error.message
          ? error.message
          : "장소를 검색하지 못했습니다.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("검색 결과에서 장소를 선택해 주세요.");
      return;
    }
    if (!isEdit && !hasSelectedCoordinates(selected)) {
      setError("검색 결과에서 장소를 선택해 주세요.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: selected.name,
      address: selected.address,
      ...(resolvedKind ? { kind: resolvedKind } : isEdit ? { kind: "visit" as const } : {}),
      stayMinutes: noStay ? 0 : stayMinutes,
      ...(typeof selected.latitude === "number" ? { latitude: selected.latitude } : {}),
      ...(typeof selected.longitude === "number" ? { longitude: selected.longitude } : {}),
      ...(selected.category ? { category: selected.category } : {}),
    };

    try {
      if (!trip) {
        setError("일정을 찾을 수 없어요.");
        return;
      }

      let nextTrip: Trip | null = null;
      let addedId: string | undefined;

      if (isEdit && placeId && editingPlace) {
        const previous = {
          latitude: editingPlace.latitude,
          longitude: editingPlace.longitude,
        };
        nextTrip = applyUpdatePlaceInTrip(trip, placeId, payload);
        if (!nextTrip) {
          setError("장소를 저장하지 못했습니다.");
          return;
        }
        addedId = placeId;
        const updated = nextTrip.places?.find((place) => place.id === placeId);
        const coordsChanged = Boolean(
          updated && placeCoordinatesChanged(previous, updated),
        );
        const persisted = await persistPlaceTrip(nextTrip);
        if (!persisted) {
          return;
        }
        if (coordsChanged) {
          if (isShared) {
            let latest = persisted;
            await refreshAdjacentTravelTimes(tripId, placeId, {
              getTrip: () => latest,
              saveTrip: (current) => {
                latest = current;
                return current;
              },
            });
            await persistPlaceTrip(latest);
          } else {
            await refreshAdjacentTravelTimes(tripId, placeId);
          }
        }
        router.push(`${tripHref}?place=${encodeURIComponent(placeId)}`, {
          scroll: false,
        });
        return;
      }

      nextTrip = applyAddPlaceToTrip(trip, {
        ...payload,
        date: dayDate,
      });
      addedId = nextTrip.places?.at(-1)?.id;
      const persisted = await persistPlaceTrip(nextTrip);
      if (!persisted) {
        return;
      }
      const href = addedId
        ? `${tripHref}?place=${encodeURIComponent(addedId)}`
        : tripHref;
      router.push(href, { scroll: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#F6F1E8] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-[#F6F1E8]/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-3 px-4 sm:h-16">
          <Link
            href={tripHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-slate-700"
            aria-label="여행 상세로"
          >
            ←
          </Link>
          <p className="min-w-0 truncate text-base font-semibold tracking-tight">
            {isEdit ? "장소 수정" : "장소 추가"}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:pb-10 sm:pt-8">
        <p className="break-keep text-sm font-medium text-teal-700">{trip.title}</p>
        <h1 id={titleId} className="mt-1 break-keep text-2xl font-semibold tracking-tight">
          {formatDayLabel(dayDate, dayIndex)}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isEdit
            ? "다른 장소로 바꾸려면 검색해서 결과를 선택하세요. 이름과 주소는 좌표와 함께 바뀝니다."
            : "장소명을 검색한 뒤 결과를 선택하면 주소와 좌표가 자동으로 저장됩니다."}
        </p>

        {isEdit ? null : (
          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              장소 타입
            </span>
            <select
              value={selectedKind}
              onChange={(event) => setSelectedKind(event.target.value as PlaceKind)}
              className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
            >
              {PLACE_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <form className={isEdit ? "mt-6 space-y-4 sm:mt-8" : "mt-4 space-y-4"} onSubmit={handleSearch}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">장소명 검색</span>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 광안리 해변"
                enterKeyHint="search"
                className="min-h-12 min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-60 sm:min-w-[5.5rem]"
              >
                {isSearching ? "검색 중" : "검색"}
              </button>
            </div>
          </label>
        </form>

        {results.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {results.map((result) => {
              const isSelected =
                selected?.address === result.address &&
                selected.latitude === result.latitude &&
                selected.longitude === result.longitude;
              return (
                <li
                  key={`${result.address}-${result.latitude}-${result.longitude}`}
                  className="min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(result);
                      setError("");
                    }}
                    className={`w-full min-w-0 rounded-2xl border px-4 py-3.5 text-left transition ${
                      isSelected
                        ? "border-teal-600 bg-teal-50"
                        : "border-stone-200 bg-white hover:border-teal-200"
                    }`}
                  >
                    <p className="break-keep font-medium text-slate-900">{result.name}</p>
                    {result.category ? (
                      <p className="mt-0.5 text-xs text-teal-700">{result.category}</p>
                    ) : null}
                    <p className="mt-0.5 break-all text-sm text-slate-500">{result.address}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {searched && !isSearching && results.length === 0 && !error ? (
          <p className="mt-5 text-sm text-slate-500">검색 결과가 없습니다.</p>
        ) : null}

        {selected ? (
          <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-teal-700">
              {isEdit ? "현재 장소" : "선택한 장소"}
            </p>
            <p className="mt-1 break-keep font-medium text-slate-900">{selected.name}</p>
            <p className="mt-0.5 break-all text-sm text-slate-500">{selected.address}</p>
            {isEdit ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                장소 타입
              </span>
              <select
                value={selectedKind}
                onChange={(event) => setSelectedKind(event.target.value as PlaceKind)}
                className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
              >
                {PLACE_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            ) : null}
            {isEdit || noStay ? null : (
            <div className="mt-3">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                체류시간
              </span>
              <StayDurationField value={stayMinutes} onChange={setStayMinutes} />
            </div>
            )}
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <form
          className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-[#F6F1E8]/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
          onSubmit={handleSubmit}
          aria-labelledby={titleId}
        >
          <div className={isEdit ? "flex gap-2" : undefined}>
            {isEdit ? (
              <Link
                href={tripHref}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-stone-200 bg-white text-sm font-semibold text-slate-700"
              >
                취소
              </Link>
            ) : null}
            <button
              type="submit"
              disabled={!selected || saving}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-teal-700 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-50"
            >
              {saving ? "저장 중" : isEdit ? "수정 저장" : "일정에 추가"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function placeToSelected(place: Place): SelectedPlace {
  return {
    name: place.name,
    address: place.address,
    ...(typeof place.latitude === "number" ? { latitude: place.latitude } : {}),
    ...(typeof place.longitude === "number" ? { longitude: place.longitude } : {}),
    ...(place.category ? { category: place.category } : {}),
  };
}

function hasSelectedCoordinates(
  place: SelectedPlace,
): place is SelectedPlace & { latitude: number; longitude: number } {
  return hasCoordinates(place);
}
