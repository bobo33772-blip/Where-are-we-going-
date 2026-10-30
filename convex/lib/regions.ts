// 서버에서 쓰는 읍·면·동 목록. 브라우저가 받는 public/data/regions.json과 같은 파일이라
// 서버가 센 "남은 곳 수"와 화면의 지도가 일치한다.

import data from "../../public/data/regions.json";
import type { RegionLite } from "../../src/lib/game/filters";

export const REGIONS: RegionLite[] = data.regions;
