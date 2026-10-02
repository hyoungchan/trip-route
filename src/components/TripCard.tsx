import Link from "next/link";
import { formatTripPeriod, getTripDuration } from "@/lib/trips";
import type { Trip } from "@/types/trip";

type TripCardProps = {
  trip: Trip;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (tripId: string) => void;
};

export function TripCard({ trip, selectMode, selected, onSelect }: TripCardProps) {
  if (selectMode) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(trip.id)}
        aria-pressed={selected}
        className="block w-full rounded-3xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20"
      >
        <article
          className={`rounded-3xl border p-5 shadow-sm transition ${
            selected
              ? "border-teal-600 bg-teal-50"
              : "border-stone-200/80 bg-white"
          }`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                selected
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <TripCardBody trip={trip} actionLabel={selected ? "선택됨" : "선택"} />
            </div>
          </div>
        </article>
      </button>
    );
  }

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/20"
    >
      <article className="group rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <TripCardBody trip={trip} actionLabel="동선 보기" />
      </article>
    </Link>
  );
}

function TripCardBody({ trip, actionLabel }: { trip: Trip; actionLabel: string }) {
  return (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-teal-700">{trip.destination}</p>
          <h3 className="mt-1 break-keep text-lg font-semibold tracking-tight text-slate-900">
            {trip.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-slate-600">
          {getTripDuration(trip.startDate, trip.endDate)}
        </span>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        {formatTripPeriod(trip.startDate, trip.endDate)}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4 text-sm">
        <span className="text-slate-500">장소 {trip.stopCount}곳</span>
        <span className="font-medium text-slate-800 group-hover:text-teal-700">
          {actionLabel}
        </span>
      </div>
    </>
  );
}
