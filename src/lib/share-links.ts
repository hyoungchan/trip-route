const SHARE_IDS_STORAGE_KEY = "trip-route.shareIds";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(SHARE_IDS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const next: Record<string, string> = {};
    for (const [tripId, shareId] of Object.entries(parsed)) {
      if (typeof shareId === "string" && shareId.trim()) {
        next[tripId] = shareId.trim();
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function getSavedShareId(tripId: string): string | null {
  return readMap()[tripId] ?? null;
}

export function saveShareId(tripId: string, shareId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const next = { ...readMap(), [tripId]: shareId };
  window.localStorage.setItem(SHARE_IDS_STORAGE_KEY, JSON.stringify(next));
}
