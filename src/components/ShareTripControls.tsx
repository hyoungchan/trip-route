"use client";

import { useEffect, useState } from "react";
import { getSavedShareId, saveShareId } from "@/lib/share-links";
import { createSharedTrip, loadSharedTrip } from "@/lib/shared-trip-client";
import type { Trip } from "@/types/trip";

type ShareTripControlsProps = {
  trip: Trip;
  mode: "local" | "shared";
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function ShareTripControls({
  trip,
  mode,
  onRefresh,
  refreshing,
}: ShareTripControlsProps) {
  const [shareUrl, setShareUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode === "shared") {
      setShareUrl(window.location.origin + `/trip/${trip.id}`);
      return;
    }
    const existing = getSavedShareId(trip.id);
    if (existing) {
      setShareUrl(window.location.origin + `/trip/${existing}`);
    }
  }, [mode, trip.id]);

  async function handleShare() {
    setBusy(true);
    setStatus("");
    setCopied(false);
    try {
      if (mode === "shared") {
        const url = window.location.origin + `/trip/${trip.id}`;
        setShareUrl(url);
        setStatus("공유 링크가 생성되었습니다.");
        return;
      }

      const existing = getSavedShareId(trip.id);
      if (existing) {
        const latest = await loadSharedTrip(existing);
        if (latest) {
          const url = window.location.origin + `/trip/${existing}`;
          setShareUrl(url);
          setStatus("공유 링크가 생성되었습니다.");
          return;
        }
      }

      const created = await createSharedTrip(trip);
      saveShareId(trip.id, created.id);
      const url = window.location.origin + `/trip/${created.id}`;
      setShareUrl(url);
      setStatus("공유 링크가 생성되었습니다.");
    } catch (error) {
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "공유 링크를 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        return;
      }
    } catch {
      // fallback below
    }
    const input = document.getElementById("trip-share-url") as HTMLInputElement | null;
    input?.focus();
    input?.select();
    setCopied(false);
    setStatus("링크를 선택한 뒤 복사해 주세요.");
  }

  return (
    <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3">
      {mode === "shared" ? (
        <p className="text-xs font-medium text-teal-800">
          공유 일정 · 링크를 가진 사람은 편집할 수 있습니다.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "만드는 중..." : "🔗 일정 공유"}
        </button>
        {mode === "shared" && onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 disabled:opacity-60"
          >
            {refreshing ? "불러오는 중..." : "변경사항 확인"}
          </button>
        ) : null}
      </div>
      {status ? <p className="mt-2 text-sm text-teal-900">{status}</p> : null}
      {shareUrl ? (
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
          <input
            id="trip-share-url"
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-2xl border border-teal-200 bg-white px-3 text-sm text-slate-700"
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800"
          >
            {copied ? "복사됨" : "링크 복사"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
