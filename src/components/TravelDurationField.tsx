"use client";

import { useEffect, useRef, useState } from "react";
import { formatStayLabel, getTravelMinutes } from "@/lib/timetable";
import { hasCoordinates } from "@/lib/trips";
import {
  isTransitTravelMode,
  parseTravelTransit,
  parseTravelTransitSteps,
  transitLegsMatchSelection,
  type TransitTravelMode,
} from "@/lib/travel-transit";
import type { Place, TravelTransitLeg, TravelTransitStep } from "@/types/trip";

const DRIVE_OPTION = "drive";
const BUS_OPTION = "bus";
const SUBWAY_OPTION = "subway";
const WALK_OPTION = "walk";
const CUSTOM_OPTION = "custom";

type RouteMode = "drive" | TransitTravelMode;

type TravelDurationFieldProps = {
  id?: string;
  value?: Place["travelMinutesToNext"];
  travelMode?: Place["travelMode"];
  distanceKm?: Place["travelDistanceKm"];
  origin?: Pick<Place, "latitude" | "longitude">;
  destination?: Pick<Place, "latitude" | "longitude">;
  onChange: (minutes: number) => void;
  onWalkChange: (minutes: number) => void;
  onDriveApply: (result: { durationMinutes: number; distanceKm: number }) => void;
  onTransitApply: (result: {
    travelMode: TransitTravelMode;
    durationMinutes: number;
    distanceKm: number;
    transit: TravelTransitLeg[];
    steps: TravelTransitStep[];
  }) => void;
};

export function TravelDurationField({
  id,
  value,
  travelMode,
  origin,
  destination,
  onChange,
  onWalkChange,
  onDriveApply,
  onTransitApply,
}: TravelDurationFieldProps) {
  const minutes = getTravelMinutes({ travelMinutesToNext: value });
  const storedMode =
    travelMode === "drive" ||
    travelMode === "walk" ||
    isTransitTravelMode(travelMode)
      ? travelMode
      : null;
  const [loading, setLoading] = useState(false);
  const [selectingMode, setSelectingMode] = useState<RouteMode | null>(null);
  const [forceCustom, setForceCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(String(minutes));
  const [pendingFocus, setPendingFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);

  const selected =
    selectingMode ?? (forceCustom || !storedMode ? CUSTOM_OPTION : storedMode);
  const showCustomInput =
    (selected === CUSTOM_OPTION || selected === WALK_OPTION) && !loading;

  useEffect(() => {
    if (storedMode) {
      setForceCustom(false);
    }
  }, [storedMode]);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    setDraft(String(minutes));
  }, [minutes]);

  useEffect(() => {
    if (!pendingFocus || !showCustomInput) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
    setPendingFocus(false);
  }, [pendingFocus, showCustomInput]);

  function switchToCustom() {
    setError(null);
    setSelectingMode(null);
    setForceCustom(true);
    setDraft(String(minutes));
    setPendingFocus(true);
    onChange(minutes);
  }

  function switchToWalk() {
    setError(null);
    setSelectingMode(null);
    setForceCustom(false);
    setDraft(String(minutes));
    setPendingFocus(true);
    onWalkChange(minutes);
  }

  function commitDraft(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
      setDraft(String(minutes));
      return;
    }

    const rounded = Math.round(Number(trimmed));
    if (!Number.isFinite(rounded) || rounded < 0) {
      setDraft(String(minutes));
      return;
    }

    setDraft(String(rounded));
    if (selected === WALK_OPTION) {
      if (rounded !== minutes || travelMode !== "walk") {
        onWalkChange(rounded);
      }
      return;
    }
    if (rounded !== minutes) {
      onChange(rounded);
    }
  }

  async function applyDrive() {
    setError(null);
    setForceCustom(false);

    if (!origin || !destination || !hasCoordinates(origin) || !hasCoordinates(destination)) {
      setSelectingMode(null);
      setForceCustom(true);
      setError(
        "두 장소의 좌표가 없어 자동차 경로를 계산할 수 없습니다. 시간을 직접 입력해 주세요.",
      );
      return;
    }

    setSelectingMode("drive");
    setLoading(true);
    try {
      const response = await fetch("/api/routes/naver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
        }),
      });

      let data: {
        error?: unknown;
        durationMinutes?: unknown;
        distanceKm?: unknown;
      } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        data = {};
      }

      if (
        !response.ok ||
        typeof data.durationMinutes !== "number" ||
        !Number.isFinite(data.durationMinutes)
      ) {
        setSelectingMode(null);
        setForceCustom(true);
        setPendingFocus(true);
        setError(
          typeof data.error === "string"
            ? `${data.error} 시간을 직접 입력해 주세요.`
            : "경로를 계산하지 못했습니다. 시간을 직접 입력해 주세요.",
        );
        return;
      }

      const nextDistance =
        typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
          ? data.distanceKm
          : 0;
      onDriveApply({
        durationMinutes: data.durationMinutes,
        distanceKm: nextDistance,
      });
      setSelectingMode(null);
    } catch {
      setSelectingMode(null);
      setForceCustom(true);
      setPendingFocus(true);
      setError("경로를 계산하지 못했습니다. 시간을 직접 입력해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function applyTransit(mode: TransitTravelMode) {
    setError(null);
    setForceCustom(false);

    if (!origin || !destination || !hasCoordinates(origin) || !hasCoordinates(destination)) {
      setSelectingMode(null);
      setForceCustom(true);
      setError(
        "두 장소의 좌표가 없어 대중교통 경로를 계산할 수 없습니다. 시간을 직접 입력해 주세요.",
      );
      return;
    }

    setSelectingMode(mode);
    setLoading(true);
    try {
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
          travelMode: "TRANSIT",
          transitPreferences: {
            allowedTravelModes: mode === "bus" ? ["BUS"] : ["SUBWAY"],
          },
        }),
      });

      let data: {
        error?: unknown;
        durationMinutes?: unknown;
        distanceKm?: unknown;
        transit?: unknown;
        steps?: unknown;
      } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        data = {};
      }

      if (
        !response.ok ||
        typeof data.durationMinutes !== "number" ||
        !Number.isFinite(data.durationMinutes)
      ) {
        setSelectingMode(null);
        setForceCustom(true);
        setPendingFocus(true);
        setError(
          typeof data.error === "string"
            ? `${data.error} 시간을 직접 입력해 주세요.`
            : "대중교통 경로를 계산하지 못했습니다. 시간을 직접 입력해 주세요.",
        );
        return;
      }

      const transit = parseTravelTransit(data.transit);
      const steps = parseTravelTransitSteps(data.steps);
      if (!transitLegsMatchSelection(transit, mode)) {
        setSelectingMode(null);
        setForceCustom(true);
        setPendingFocus(true);
        setError(
          mode === "subway"
            ? "지하철 경로를 찾지 못했습니다. 시간을 직접 입력해 주세요."
            : "버스 경로를 찾지 못했습니다. 시간을 직접 입력해 주세요.",
        );
        return;
      }

      const nextDistance =
        typeof data.distanceKm === "number" && Number.isFinite(data.distanceKm)
          ? data.distanceKm
          : 0;
      onTransitApply({
        travelMode: mode,
        durationMinutes: data.durationMinutes,
        distanceKm: nextDistance,
        transit,
        steps,
      });
      setSelectingMode(null);
    } catch {
      setSelectingMode(null);
      setForceCustom(true);
      setPendingFocus(true);
      setError("대중교통 경로를 계산하지 못했습니다. 시간을 직접 입력해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <select
          id={id}
          aria-label="이동방법"
          disabled={loading}
          value={selected}
          onChange={(event) => {
            const next = event.target.value;
            if (next === CUSTOM_OPTION) {
              switchToCustom();
              return;
            }
            if (next === WALK_OPTION) {
              switchToWalk();
              return;
            }
            if (next === DRIVE_OPTION) {
              void applyDrive();
              return;
            }
            if (next === BUS_OPTION || next === SUBWAY_OPTION) {
              void applyTransit(next);
            }
          }}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 disabled:opacity-60 sm:w-44"
        >
          <option value={DRIVE_OPTION}>🚗 자동차</option>
          <option value={BUS_OPTION}>🚌 버스</option>
          <option value={SUBWAY_OPTION}>🚇 지하철</option>
          <option value={WALK_OPTION}>🚶 도보</option>
          <option value={CUSTOM_OPTION}>✏️ 직접 입력</option>
        </select>
        {showCustomInput ? (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              autoComplete="off"
              aria-label={
                selected === WALK_OPTION
                  ? "도보 이동시간 입력(분)"
                  : "이동시간 직접 입력(분)"
              }
              placeholder="분"
              value={draft}
              onFocus={() => {
                focusedRef.current = true;
              }}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== "" && !/^\d+$/.test(next)) {
                  return;
                }
                setDraft(next);
              }}
              onBlur={(event) => {
                focusedRef.current = false;
                commitDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  focusedRef.current = false;
                  commitDraft(event.currentTarget.value);
                  event.currentTarget.blur();
                }
              }}
              className="min-h-11 w-24 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
            />
            분
          </label>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 text-xs leading-5 text-teal-800/80">경로 계산 중...</p>
      ) : null}
      {error && !loading ? (
        <p className="mt-2 text-xs leading-5 text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

export function formatDrivingTravelLabel(
  minutes: number,
  distanceKm: number | undefined,
) {
  if (typeof distanceKm === "number" && Number.isFinite(distanceKm)) {
    return `🚗 자동차 · ${formatStayLabel(minutes)} · ${formatDistanceKm(distanceKm)}`;
  }
  return `🚗 자동차 · ${formatStayLabel(minutes)}`;
}

export function formatWalkTravelLabel(minutes: number) {
  return `🚶 도보 · ${minutes}분`;
}

export function formatManualTravelLabel(minutes: number) {
  return `✏️ 직접 입력 · ${minutes}분`;
}

function formatDistanceKm(distanceKm: number) {
  const rounded = Math.round(distanceKm * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}km` : `${rounded.toFixed(1)}km`;
}
