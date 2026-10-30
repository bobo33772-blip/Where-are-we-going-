"use client";

import { useMemo } from "react";
import type { Region } from "@/lib/regions";
import type { Origin, RoundView } from "@/lib/room/types";
import { applyFilters, type RegionFilter } from "./filters";
import { chosenFilters } from "./questions";

export type Remaining = {
  regions: Region[];
  // 지워진 지역 코드 (지도 칠하기용)
  excluded: Set<string>;
  // 지도를 맞출 점들. 아직 아무 기준도 없으면 전국을 보여주도록 null
  focus: Region[] | null;
};

// 공개된 질문들의 기준을 적용해 남은 지역을 계산한다.
// holdRoundId: 룰렛이 도는 동안처럼 결과를 아직 지도에 반영하지 않을 질문
export function useRemaining(
  regions: Region[] | null,
  origin: Origin | null,
  rounds: RoundView[],
  holdRoundId: string | null = null,
): Remaining | null {
  // 방 상태가 바뀔 때마다(누가 답을 고를 때마다) 다시 계산하지 않도록, 기준이 실제로 바뀔 때만 계산한다.
  const filtersKey = JSON.stringify(chosenFilters(rounds.filter((r) => r.id !== holdRoundId)));
  const lat = origin?.lat;
  const lng = origin?.lng;

  return useMemo(() => {
    if (!regions || lat === undefined || lng === undefined) return null;
    const filters = JSON.parse(filtersKey) as RegionFilter[];
    const remaining = applyFilters(regions, { lat, lng }, filters);
    const keep = new Set(remaining.map((r) => r.code));
    return {
      regions: remaining,
      excluded: new Set(regions.filter((r) => !keep.has(r.code)).map((r) => r.code)),
      focus: filters.length > 0 ? remaining : null,
    };
  }, [regions, lat, lng, filtersKey]);
}
