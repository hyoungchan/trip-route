"use client";

import { useEffect, useRef, useState } from "react";
import { formatStayLabel } from "@/lib/timetable";

type DurationMinutesFieldProps = {
  id?: string;
  value?: number;
  presets: readonly number[];
  fallback: number;
  allowZero?: boolean;
  selectLabel: string;
  inputLabel: string;
  onChange: (minutes: number) => void;
};

const CUSTOM_VALUE = "custom";

export function DurationMinutesField({
  id,
  value,
  presets,
  fallback,
  allowZero = false,
  selectLabel,
  inputLabel,
  onChange,
}: DurationMinutesFieldProps) {
  const presetSet = new Set(presets);
  const committed = resolveMinutes(value, fallback, allowZero);
  const isPreset = presetSet.has(committed);
  const [useCustom, setUseCustom] = useState(!isPreset);
  const [draft, setDraft] = useState(() => (isPreset ? "" : String(committed)));
  const [pendingFocus, setPendingFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    if (!isPreset) {
      setUseCustom(true);
      setDraft(String(committed));
    }
  }, [committed, isPreset]);

  useEffect(() => {
    if (!pendingFocus || !useCustom) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    setPendingFocus(false);
  }, [pendingFocus, useCustom]);

  function commitDraft(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
      setDraft(isPreset && useCustom ? "" : String(committed));
      return;
    }

    const next = Number(trimmed);
    const rounded = Math.round(next);
    const valid = Number.isFinite(next) && (rounded > 0 || (allowZero && rounded === 0));
    if (!valid) {
      setDraft(String(committed));
      return;
    }

    setDraft(String(rounded));
    if (rounded !== committed) {
      onChange(rounded);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <select
        id={id}
        aria-label={selectLabel}
        value={useCustom ? CUSTOM_VALUE : String(committed)}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CUSTOM_VALUE) {
            setUseCustom(true);
            setDraft("");
            setPendingFocus(true);
            return;
          }
          setUseCustom(false);
          setDraft("");
          onChange(Number(next));
        }}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 sm:w-40"
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset === 0 ? "이동 없음" : formatStayLabel(preset)}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>직접 입력</option>
      </select>
      {useCustom ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            autoComplete="off"
            aria-label={inputLabel}
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
  );
}

function resolveMinutes(value: number | undefined, fallback: number, allowZero: boolean) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded > 0 || (allowZero && rounded === 0)) {
      return rounded;
    }
  }
  return fallback;
}
