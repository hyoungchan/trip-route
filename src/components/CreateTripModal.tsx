"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";

type CreateTripModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; destination: string; startDate: string; endDate: string }) => void;
};

export function CreateTripModal({ open, onClose, onCreate }: CreateTripModalProps) {
  const titleId = useId();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!open) {
      setStartDate("");
      setEndDate("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleStartDateChange(next: string) {
    setStartDate(next);
    if (endDate && next && endDate < next) {
      setEndDate(next);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const destination = String(form.get("destination") ?? "").trim();
    const nextStartDate = String(form.get("startDate") ?? "");
    const nextEndDate = String(form.get("endDate") ?? "");

    if (!title || !destination || !nextStartDate || !nextEndDate) {
      return;
    }
    if (nextEndDate < nextStartDate) {
      return;
    }

    onCreate({
      title,
      destination,
      startDate: nextStartDate,
      endDate: nextEndDate,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[min(92dvh,40rem)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-medium text-teal-700">새 여행</p>
        <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          어디로 떠나나요?
        </h2>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">여행 이름</span>
            <input
              name="title"
              required
              placeholder="예: 제주 힐링 여행"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">목적지</span>
            <input
              name="destination"
              required
              placeholder="예: 제주"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NativeDateField
              label="시작일"
              name="startDate"
              value={startDate}
              onChange={handleStartDateChange}
            />
            <NativeDateField
              label="종료일"
              name="endDate"
              value={endDate}
              min={startDate || undefined}
              onChange={setEndDate}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            >
              여행 만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NativeDateField({
  label,
  name,
  value,
  min,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  min?: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      }
    } catch {
      input.focus();
    }
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          name={name}
          type="date"
          required
          value={value}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          onClick={openPicker}
          className="trip-date-input relative min-h-12 w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-transparent outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/15"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
          <span className={value ? "text-slate-900" : "text-slate-400"}>
            {value || "YYYY-MM-DD"}
          </span>
          <span className="text-slate-400" aria-hidden="true">
            📅
          </span>
        </div>
      </div>
    </label>
  );
}
