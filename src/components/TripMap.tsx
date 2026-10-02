"use client";

import { useEffect, useRef, useState } from "react";
import { openNaverPlaceMap } from "@/lib/external-map-links";
import {
  geocodeAddress,
  getNaverMapClientId,
  loadNaverMaps,
} from "@/lib/naver-maps";
import { emojiForPlace } from "@/lib/place-category";
import { hasCoordinates } from "@/lib/trips";
import type { Place } from "@/types/trip";

type CoordinateUpdate = { id: string; latitude: number; longitude: number };

type MappedPlace = Place & {
  number: number;
  latitude: number;
  longitude: number;
};

type TripMapProps = {
  places: Place[];
  onCoordinatesResolved?: (updates: CoordinateUpdate[]) => void;
};

export function TripMap({ places, onCoordinatesResolved }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markersRef = useRef<naver.maps.Marker[]>([]);
  const listenersRef = useRef<naver.maps.MapEventListener[]>([]);
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null);
  const openPlaceIdRef = useRef<string | null>(null);
  const onResolvedRef = useRef(onCoordinatesResolved);
  const [status, setStatus] = useState<"loading" | "ready" | "missing-key" | "error">(
    getNaverMapClientId() ? "loading" : "missing-key",
  );

  onResolvedRef.current = onCoordinatesResolved;

  const placeKey = places
    .map(
      (place, index) =>
        `${place.id}:${index}:${place.latitude ?? ""}:${place.longitude ?? ""}:${place.address}`,
    )
    .join("|");

  useEffect(() => {
    if (!getNaverMapClientId()) {
      setStatus("missing-key");
      return;
    }

    let cancelled = false;

    loadNaverMaps()
      .then(() => {
        if (cancelled || !containerRef.current) {
          return;
        }

        mapRef.current = new window.naver.maps.Map(containerRef.current, {
          center: new window.naver.maps.LatLng(37.5665, 126.978),
          zoom: 12,
          scaleControl: false,
          logoControl: true,
          mapDataControl: false,
        });
        infoWindowRef.current = new window.naver.maps.InfoWindow({
          content: "",
          backgroundColor: "#ffffff",
          borderColor: "#e7e5e4",
          borderWidth: 1,
          disableAnchor: false,
          pixelOffset: new window.naver.maps.Point(0, -6),
          maxWidth: 280,
        });
        mapRef.current.autoResize();
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      clearMapListeners();
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (status !== "ready" || !map || !container) {
      return;
    }

    const resize = () => {
      map.autoResize();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("orientationchange", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) {
      return;
    }

    const numberedPlaces = places.map((place, index) => ({
      ...place,
      number: index + 1,
    }));

    let cancelled = false;

    async function syncMarkers() {
      const missing = numberedPlaces.filter((place) => !hasCoordinates(place));
      const resolved: CoordinateUpdate[] = [];

      for (const place of missing) {
        const coords = await geocodeAddress(place.address);
        if (coords) {
          resolved.push({ id: place.id, ...coords });
        }
      }

      if (cancelled) {
        return;
      }

      if (resolved.length > 0) {
        onResolvedRef.current?.(resolved);
      }

      const withCoords = numberedPlaces.map((place) => {
        const update = resolved.find((item) => item.id === place.id);
        return update ? { ...place, ...update } : place;
      });

      drawMarkers(
        withCoords.filter((place): place is MappedPlace => hasCoordinates(place)),
      );
    }

    void syncMarkers();

    return () => {
      cancelled = true;
    };
  }, [status, placeKey, places]);

  function clearMapListeners() {
    if (!window.naver?.maps) {
      listenersRef.current = [];
      return;
    }
    listenersRef.current.forEach((listener) => {
      window.naver.maps.Event.removeListener(listener);
    });
    listenersRef.current = [];
  }

  function closeInfoWindow() {
    infoWindowRef.current?.close();
    openPlaceIdRef.current = null;
  }

  function drawMarkers(mapped: MappedPlace[]) {
    const map = mapRef.current;
    if (!map || !window.naver?.maps) {
      return;
    }

    clearMapListeners();
    closeInfoWindow();
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    listenersRef.current.push(
      window.naver.maps.Event.addListener(map, "click", () => {
        closeInfoWindow();
      }),
    );

    if (mapped.length === 0) {
      map.setCenter(new window.naver.maps.LatLng(37.5665, 126.978));
      map.setZoom(12);
      return;
    }

    const first = new window.naver.maps.LatLng(
      mapped[0].latitude,
      mapped[0].longitude,
    );
    const bounds = new window.naver.maps.LatLngBounds(first, first);

    mapped.forEach((place) => {
      const position = new window.naver.maps.LatLng(place.latitude, place.longitude);
      bounds.extend(position);
      const marker = new window.naver.maps.Marker({
        map,
        position,
        title: `${place.number}. ${place.name}`,
        icon: {
          content: markerContent(place.number),
          size: new window.naver.maps.Size(28, 28),
          anchor: new window.naver.maps.Point(14, 14),
        },
      });
      listenersRef.current.push(
        window.naver.maps.Event.addListener(marker, "click", () => {
          const infoWindow = infoWindowRef.current;
          if (!infoWindow) {
            return;
          }
          if (openPlaceIdRef.current === place.id && infoWindow.getMap()) {
            closeInfoWindow();
            return;
          }
          infoWindow.setContent(createInfoWindowContent(place));
          infoWindow.open(map, marker);
          openPlaceIdRef.current = place.id;
        }),
      );
      markersRef.current.push(marker);
    });

    if (mapped.length === 1) {
      map.setCenter(first);
      map.setZoom(14);
      return;
    }

    const pad = window.innerWidth < 640 ? 28 : 40;
    map.fitBounds(bounds, { top: pad, right: pad, bottom: pad, left: pad });
  }

  const locatedCount = places.filter(hasCoordinates).length;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white shadow-sm sm:rounded-[2rem] lg:flex lg:h-[calc(100dvh-6.5rem)] lg:flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight">지도</h2>
        <p className="text-xs text-slate-400">
          {locatedCount}/{places.length}곳 표시
        </p>
      </div>
      <div className="relative h-[min(42svh,18rem)] w-full overflow-hidden bg-stone-100 sm:h-80 lg:h-auto lg:min-h-0 lg:flex-1">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
        {status !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#F6F1E8]/90 px-6 text-center">
            <p className="text-sm leading-6 text-slate-600">{statusMessage(status)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function createInfoWindowContent(place: MappedPlace) {
  const root = document.createElement("div");
  root.style.cssText =
    "box-sizing:border-box;min-width:12.5rem;max-width:16.5rem;padding:2px 2px 4px;";

  const title = document.createElement("p");
  title.style.cssText =
    "margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0f172a;word-break:keep-all;";
  title.textContent = `${emojiForPlace(place)} ${place.name}`;
  root.appendChild(title);

  if (place.address.trim()) {
    const address = document.createElement("p");
    address.style.cssText =
      "margin:4px 0 0;font-size:12px;line-height:1.45;color:#64748b;word-break:break-all;";
    address.textContent = place.address;
    root.appendChild(address);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "네이버 지도에서 보기";
  button.style.cssText =
    "margin-top:10px;display:flex;min-height:44px;width:100%;align-items:center;justify-content:center;border:0;border-radius:9999px;background:#0f766e;color:#fff;font-size:13px;font-weight:600;cursor:pointer;";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openNaverPlaceMap(place);
  });
  root.appendChild(button);

  return root;
}

function markerContent(number: number) {
  return `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#0f766e;color:#fff;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(15,23,42,0.25);border:2px solid #fff;">${number}</div>`;
}

function statusMessage(status: "loading" | "missing-key" | "error") {
  if (status === "missing-key") {
    return "지도를 보려면 .env.local에 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID를 설정한 뒤 개발 서버를 다시 시작해 주세요.";
  }
  if (status === "error") {
    return "지도를 불러오지 못했습니다. 네이버 클라우드 콘솔의 Client ID와 웹 서비스 URL을 확인해 주세요.";
  }
  return "지도를 불러오는 중...";
}
