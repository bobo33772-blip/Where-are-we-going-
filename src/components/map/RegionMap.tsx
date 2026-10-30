"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/game/filters";
import { BOUNDARIES_URL } from "@/lib/regions";
import type { Origin } from "@/lib/room/types";

// 독도까지 들어오도록 잡은 대한민국 범위
const KOREA_BOUNDS: maplibregl.LngLatBoundsLike = [
  [124.5, 33.0],
  [132.0, 38.7],
];

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 지워지는 지역이 잠깐 이 색으로 번쩍인 뒤 어두워진다.
const LEAVING_MS = 900;

type Props = {
  origin: Origin | null;
  // 기준에 맞지 않아 지워진 읍·면·동 코드. null이면 아무것도 지우지 않는다.
  excludedCodes?: Set<string> | null;
  // 지도를 이 점들이 모두 보이도록 맞춘다. (남은 지역의 대표점)
  focusPoints?: Point[] | null;
};

// 배경 지도 타일 없이 읍·면·동 경계만 그리는 지도.
// 기준 라운드에서 지역이 지워지는 연출, 다트 라운드의 다트 연출도 이 위에 얹는다.
export default function RegionMap({ origin, excludedCodes = null, focusPoints = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const shownExcludedRef = useRef<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      style: {
        version: 8,
        sources: {
          // feature-state로 지역별 상태(지워짐, 지워지는 중)를 바꾸기 위해 코드를 id로 쓴다.
          regions: { type: "geojson", data: BOUNDARIES_URL, promoteId: "code" },
        },
        layers: [
          { id: "sea", type: "background", paint: { "background-color": cssVar("--map-sea") } },
          {
            id: "land",
            type: "fill",
            source: "regions",
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "leaving"], false],
                cssVar("--map-leaving"),
                ["boolean", ["feature-state", "out"], false],
                cssVar("--map-out"),
                cssVar("--map-land"),
              ],
            },
          },
          {
            id: "borders",
            type: "line",
            source: "regions",
            paint: { "line-color": cssVar("--map-line"), "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 10, 1] },
          },
        ],
      },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        // CC BY 4.0: 출처, 라이선스 링크, 변경 사실(이 서비스의 간소화)을 함께 표시한다.
        customAttribution:
          '경계: <a href="https://sgis.mods.go.kr" target="_blank" rel="noopener">국가데이터처(옛 통계청) SGIS</a> · ' +
          '가공 <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">vuski/admdongkor</a> · ' +
          "이 서비스에서 간소화 · " +
          '<a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noopener">CC BY 4.0</a>',
      }),
    );
    // 작은 화면에서 출처 문구가 지도를 가리지 않도록 처음에는 접어 둔다. (ⓘ를 누르면 펼쳐진다)
    // MapLibre는 컨트롤을 붙이는 즉시 펼친 상태로 만들므로, 붙인 직후에 접는다.
    // (지도 로드 뒤에 접으면 그 전에 사용자가 펼친 것까지 접혀 버린다)
    containerRef.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    map.once("load", () => setLoaded(true));
    mapRef.current = map;
    const shownExcluded = shownExcludedRef.current;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      shownExcluded.clear();
    };
  }, []);

  // 새로 지워진 지역은 잠깐 번쩍인 뒤 어두워지고, 다시 살아난 지역은 원래 색으로 돌아온다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const next = excludedCodes ?? new Set<string>();
    const shown = shownExcludedRef.current;
    const leaving = [...next].filter((code) => !shown.has(code));
    const returning = [...shown].filter((code) => !next.has(code));

    for (const id of returning) map.setFeatureState({ source: "regions", id }, { out: false, leaving: false });
    for (const id of leaving) map.setFeatureState({ source: "regions", id }, { leaving: true });
    shownExcludedRef.current = new Set(next);

    if (leaving.length === 0) return;
    const settle = () => {
      for (const id of leaving) {
        if (shownExcludedRef.current.has(id)) map.setFeatureState({ source: "regions", id }, { leaving: false, out: true });
      }
    };
    const timer = setTimeout(settle, LEAVING_MS);
    // 번쩍이는 도중에 기준이 또 바뀌면, 번쩍이던 지역을 바로 어둡게 마무리한다. (빨간 채로 남지 않게)
    return () => {
      clearTimeout(timer);
      if (mapRef.current === map) settle();
    };
  }, [excludedCodes, loaded]);

  // 남은 지역이 한눈에 보이도록 지도를 맞춘다.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !focusPoints || focusPoints.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of focusPoints) bounds.extend([p.lng, p.lat]);
    // 지역이 지워지는 연출을 먼저 보여준 뒤 움직인다.
    const timer = setTimeout(() => map.fitBounds(bounds, { padding: 32, maxZoom: 9, duration: 1200 }), LEAVING_MS);
    return () => clearTimeout(timer);
  }, [focusPoints, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.remove();
    markerRef.current = null;
    if (!origin) return;

    const el = document.createElement("div");
    el.className = "rounded-full bg-white px-2 py-1 text-xs font-bold shadow-md text-stone-900";
    el.textContent = `🚩 ${origin.name}`;
    markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([origin.lng, origin.lat])
      .addTo(map);
  }, [origin]);

  return <div ref={containerRef} className="h-full w-full" aria-label="대한민국 읍·면·동 지도" role="img" />;
}
