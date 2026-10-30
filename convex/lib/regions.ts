// 서버에서 쓰는 읍·면·동 목록과 경계. 브라우저가 받는 public/data의 파일과 같은 파일이라
// 서버가 센 "남은 곳 수"·다트 판정과 화면의 지도가 일치한다.

import data from "../../public/data/regions.json";
import boundaries from "../../public/data/boundaries.json";
import { indexBoundaries, type BoundaryFeature } from "../../src/lib/game/darts";
import type { RegionLite } from "../../src/lib/game/filters";

export const REGIONS: RegionLite[] = data.regions;

const byCode = new Map(REGIONS.map((r) => [r.code, r]));
export const regionByCode = (code: string) => byCode.get(code) ?? null;

// 처음 쓸 때 한 번만 색인을 만든다.
let indexed: ReturnType<typeof indexBoundaries> | null = null;
export function boundaryIndex() {
  indexed ??= indexBoundaries(boundaries.features as unknown as BoundaryFeature[]);
  return indexed;
}
