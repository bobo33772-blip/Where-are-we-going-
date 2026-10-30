"use client";

import { useEffect, useState } from "react";
import type { RegionLite } from "./game/filters";
import type { Origin } from "./room/types";

export type Region = RegionLite;

export const REGIONS_URL = "/data/regions.json";
export const BOUNDARIES_URL = "/data/regions.geojson";

let regionsPromise: Promise<Region[]> | null = null;

// 읍·면·동 목록(약 600KB, 압축 전송 시 약 80KB)은 처음 필요할 때 한 번만 받는다.
export function loadRegions(): Promise<Region[]> {
  regionsPromise ??= fetch(REGIONS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`지역 목록을 불러오지 못했어요. (${res.status})`);
      return res.json() as Promise<{ regions: Region[] }>;
    })
    .then((data) => data.regions)
    .catch((error) => {
      regionsPromise = null;
      throw error;
    });
  return regionsPromise;
}

// 지역 목록을 불러오는 훅. 불러오는 중에는 regions가 null이다.
export function useRegions() {
  const [state, setState] = useState<{ regions: Region[] | null; error: string | null }>({ regions: null, error: null });

  useEffect(() => {
    let alive = true;
    loadRegions().then(
      (regions) => alive && setState({ regions, error: null }),
      (error: Error) => alive && setState({ regions: null, error: error.message }),
    );
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

// 동네 이름이 직접 맞는 결과를 먼저 보여준다.
// (예: "성산" → 성산읍·성산1동이 "창원시성산구 ○○동"보다 앞에)
export function searchRegions(regions: Region[], query: string, limit = 10): Region[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const last = terms.at(-1)!;
  const rank = (r: Region) => (r.name === last ? 0 : r.name.startsWith(last) ? 1 : r.name.includes(last) ? 2 : 3);
  return regions
    .filter((r) => terms.every((t) => r.fullName.includes(t)))
    .map((r) => ({ r, score: rank(r) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ r }) => r);
}

// 자주 쓰는 출발지. 좌표는 역사 위치 기준이며 직선거리 계산용이라 수백 m 오차는 괜찮다.
export const ORIGIN_PRESETS: Origin[] = [
  { name: "서울역", lat: 37.5547, lng: 126.9707 },
  { name: "용산역", lat: 37.5298, lng: 126.9648 },
  { name: "수서역", lat: 37.4873, lng: 127.1015 },
  { name: "대전역", lat: 36.3324, lng: 127.4342 },
  { name: "동대구역", lat: 35.8793, lng: 128.6286 },
  { name: "광주송정역", lat: 35.1374, lng: 126.7913 },
  { name: "부산역", lat: 35.1152, lng: 129.0422 },
];
