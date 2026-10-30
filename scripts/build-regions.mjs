// 읍·면·동 경계 원본(GeoJSON)을 웹에서 쓰기 좋은 크기로 가공한다.
//
// 출력
//   public/data/boundaries.json   지도 표시와 다트 판정용 간소화 경계 (속성: code)
//   public/data/regions.json     지역 목록 (코드, 이름, 시도, 시군구, 대표 좌표)
//
// 실행: npm run build:regions
//
// 원자료: 국가데이터처(옛 통계청) SGIS 행정동 경계 (공공누리 제1유형)
// 가공: vuski/admdongkor (CC BY 4.0) — https://github.com/vuski/admdongkor
// 이 스크립트의 변경: 경계 간소화, 코드 외 속성 제거, 대표점(inner point) 추출

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 재현 가능한 결과를 위해 원본 커밋과 버전을 고정한다.
const SOURCE_COMMIT = "d5d5a821c8de6cc337d47eeca604d7af76271c9b";
const SOURCE_VERSION = "ver20261001";
const SOURCE_URL = `https://raw.githubusercontent.com/vuski/admdongkor/${SOURCE_COMMIT}/${SOURCE_VERSION}/HangJeongDong_${SOURCE_VERSION}.geojson`;

const RAW_PATH = join(ROOT, "data/raw", `HangJeongDong_${SOURCE_VERSION}.geojson`);
const OUT_DIR = join(ROOT, "public/data");
const BOUNDARY_PATH = join(OUT_DIR, "boundaries.json");
const LIST_PATH = join(OUT_DIR, "regions.json");

// 경계 간소화 비율. 낮을수록 가볍지만 해안선이 거칠어진다.
const SIMPLIFY = "5%";

async function download() {
  if (existsSync(RAW_PATH)) return;
  console.log(`원본 다운로드: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`다운로드 실패: ${res.status} ${res.statusText}`);
  mkdirSync(dirname(RAW_PATH), { recursive: true });
  writeFileSync(RAW_PATH, Buffer.from(await res.arrayBuffer()));
}

async function buildBoundaries() {
  await mapshaper.runCommands(
    [
      `-i "${RAW_PATH}"`,
      `-each "code=adm_cd2"`,
      `-filter-fields code`,
      `-simplify ${SIMPLIFY} keep-shapes`,
      `-o "${BOUNDARY_PATH}" format=geojson precision=0.0001`,
    ].join(" "),
  );
}

async function buildList() {
  // 폴리곤 안쪽에 반드시 들어가는 대표점(inner point)을 뽑는다.
  // 무게중심은 초승달 모양 지역에서 경계 밖으로 나갈 수 있기 때문이다.
  const tmpPath = join(ROOT, "data/raw/points.geojson");
  await mapshaper.runCommands(
    [`-i "${RAW_PATH}"`, `-points inner`, `-o "${tmpPath}" format=geojson`].join(" "),
  );

  const points = JSON.parse(readFileSync(tmpPath, "utf8"));
  const regions = points.features
    .map(({ properties: p, geometry }) => {
      const [lng, lat] = geometry.coordinates;
      return {
        code: p.adm_cd2,
        name: p.adm_nm.split(" ").at(-1),
        fullName: p.adm_nm,
        sido: p.sidonm,
        sgg: p.sggnm,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  writeFileSync(
    LIST_PATH,
    JSON.stringify({
      version: SOURCE_VERSION,
      attribution:
        "국가데이터처(옛 통계청) SGIS 행정동 경계(공공누리 제1유형)를 vuski/admdongkor가 가공(CC BY 4.0)하고 이 서비스에서 간소화",
      regions,
    }),
  );
  return regions.length;
}

await download();
mkdirSync(OUT_DIR, { recursive: true });
await buildBoundaries();
const count = await buildList();
console.log(`완료: 읍·면·동 ${count}곳`);
