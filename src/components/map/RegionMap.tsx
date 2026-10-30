"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
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

// 배경 지도 타일 없이 읍·면·동 경계만 그리는 지도.
// 다트 라운드에서 지역을 지우고 다트를 꽂는 연출도 이 위에 얹는다.
export default function RegionMap({ origin }: { origin: Origin | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

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
          regions: { type: "geojson", data: BOUNDARIES_URL },
        },
        layers: [
          { id: "sea", type: "background", paint: { "background-color": cssVar("--map-sea") } },
          { id: "land", type: "fill", source: "regions", paint: { "fill-color": cssVar("--map-land") } },
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
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

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
