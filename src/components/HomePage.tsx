"use client";

import { useEffect, useId, useState } from "react";
import { deleteTripById, loadCreatedTrips, saveCreatedTrips, seedNewTripCollapsedDates } from "@/lib/trips";
import type { Trip } from "@/types/trip";
import { CreateTripModal } from "./CreateTripModal";
import { TripCard } from "./TripCard";

export function HomePage() {
  const [createdTrips, setCreatedTrips] = useState<Trip[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmTitleId = useId();

  useEffect(() => {
    setCreatedTrips(loadCreatedTrips());
  }, []);

  const selectedTrip = createdTrips.find((trip) => trip.id === selectedTripId) ?? null;

  function exitDeleteMode() {
    setDeleteMode(false);
    setSelectedTripId(null);
    setConfirmOpen(false);
  }

  function handleCreate(input: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
  }) {
    const nextTrip: Trip = {
      id: crypto.randomUUID(),
      title: input.title,
      destination: input.destination,
      startDate: input.startDate,
      endDate: input.endDate,
      stopCount: 0,
      places: [],
    };
    const nextTrips = [nextTrip, ...createdTrips];
    setCreatedTrips(nextTrips);
    saveCreatedTrips(nextTrips);
    seedNewTripCollapsedDates(nextTrip.id, nextTrip.startDate, nextTrip.endDate);
    setIsModalOpen(false);
  }

  function handleConfirmDelete() {
    if (!selectedTripId) {
      return;
    }
    const nextTrips = deleteTripById(selectedTripId);
    if (!nextTrips) {
      return;
    }
    setCreatedTrips(nextTrips);
    exitDeleteMode();
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#F6F1E8] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-[#F6F1E8]/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
              <RouteMark />
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight">Trip Route</p>
              <p className="hidden text-xs text-slate-500 sm:block">여행 동선을 한눈에</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hidden rounded-full bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 sm:inline-flex"
          >
            새로운 여행 만들기
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-16 sm:pt-10">
        <section className="overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#0F766E_0%,#134E4A_52%,#1C1917_100%)] px-5 py-7 text-white shadow-lg sm:rounded-[2rem] sm:px-10 sm:py-12">
          <p className="text-sm font-medium text-teal-100">나만의 여행 동선</p>
          <h1 className="mt-2 max-w-xl text-[1.65rem] font-semibold leading-tight tracking-tight break-keep sm:text-4xl">
            가고 싶은 장소를 모아
            <br />
            자연스러운 동선으로 연결하세요
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-teal-50/90 sm:text-base">
            지금은 기본 화면만 준비되어 있습니다. 여행 목록을 보고, 새 여행을 만들어 다음 단계로 이어갈 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50"
          >
            새로운 여행 만들기
          </button>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">내 여행</h2>
              <p className="mt-1 text-sm text-slate-500">
                {deleteMode
                  ? "삭제할 여행을 선택하세요."
                  : "직접 만든 여행이 여기에 표시됩니다."}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-slate-400">{createdTrips.length}개</p>
          </div>

          {createdTrips.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-16 text-center">
              <p className="text-lg font-semibold text-slate-800">아직 만든 여행이 없어요</p>
              <p className="mt-2 text-sm text-slate-500">
                첫 여행을 만들고 동선 계획을 시작해 보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {createdTrips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  selectMode={deleteMode}
                  selected={selectedTripId === trip.id}
                  onSelect={(tripId) =>
                    setSelectedTripId((current) => (current === tripId ? null : tripId))
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {createdTrips.length > 0 ? (
        <div className="fixed right-4 z-30 flex flex-col items-end gap-2 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6">
          {deleteMode ? (
            <>
              {selectedTrip ? (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-red-700"
                >
                  🗑️ 선택한 일정 삭제
                </button>
              ) : null}
              <button
                type="button"
                onClick={exitDeleteMode}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-stone-50"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDeleteMode(true);
                setSelectedTripId(null);
                setConfirmOpen(false);
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg transition hover:bg-stone-50"
            >
              🗑️ 일정 삭제
            </button>
          )}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-[#F6F1E8]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-teal-700 text-sm font-semibold text-white shadow-sm"
        >
          새로운 여행 만들기
        </button>
      </div>

      <CreateTripModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
      />

      {confirmOpen && selectedTrip ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="relative w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 sm:pb-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id={confirmTitleId}
              className="text-xl font-semibold tracking-tight text-slate-900"
            >
              일정 삭제
            </h2>
            <p className="mt-3 break-keep text-sm leading-6 text-slate-600">
              &lsquo;{selectedTrip.title}&rsquo; 일정을 삭제하시겠습니까?
            </p>
            <p className="mt-2 text-sm text-slate-500">삭제한 일정은 복구할 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RouteMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 0c4.5 0 4.5 4 9 4m0 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0 5c-4.5 0-4.5 4-9 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
