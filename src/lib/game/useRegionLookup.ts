"use client";

import { useMemo } from "react";
import type { Region } from "@/lib/regions";

// 지역 코드 → 지역 정보
export function useRegionLookup(regions: Region[] | null) {
  return useMemo(() => new Map((regions ?? []).map((r) => [r.code, r])), [regions]);
}

// "강원특별자치도 평창군 진부면" 같은 짧은 설명
export const regionPlace = (r: Region) => `${r.sido} ${r.sgg}`;
