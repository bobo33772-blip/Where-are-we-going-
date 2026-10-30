// 다트 착지 판정. 서버(Convex)가 이 코드로 착지 지점과 결과를 정해서, 모든 참여자가 같은 결과를 본다.

import { distanceKm, type Point, type RegionLite } from "./filters";

// 한 사람이 다시 던질 수 있는 최대 횟수. 이만큼 던져도 남은 땅에 못 꽂으면 가장 가까운 남은 지역으로 옮긴다.
export const MAX_ATTEMPTS = 3;
// 고른 지역을 감싸는 사각형을 이 비율만큼 넓힌 범위에 떨어진다. (경계·해안 근처에서 빗나갈 수 있게)
const AIM_SPREAD = 0.6;

export type DartOutcome =
  | "hit" // 남은 땅에 꽂힘
  | "sea" // 어느 읍·면·동에도 안 꽂힘 (바다 등)
  | "outside" // 기준으로 지워진 땅에 꽂힘
  | "snapped"; // 마지막 시도도 실패해서 가장 가까운 남은 지역으로 옮김

type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
export type BoundaryFeature = { properties: { code: string }; geometry: Geometry };

type IndexedBoundary = {
  code: string;
  polygons: Ring[][];
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  // 대략적인 면적 (경도는 위도에 따라 줄어드는 만큼 보정한 "도²" 단위). 비교용이라 단위는 상관없다.
  area: number;
};

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(sum) / 2;
}

// 경계마다 감싸는 사각형을 미리 계산해 두고, 점이 사각형 안에 있을 때만 정밀하게 검사한다.
export function indexBoundaries(features: BoundaryFeature[]): IndexedBoundary[] {
  return features.map(({ properties, geometry }) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const polygon of polygons) {
      for (const [lng, lat] of polygon[0]) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
    const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const area = polygons.reduce((sum, [outer, ...holes]) => sum + ringArea(outer) - holes.reduce((h, r) => h + ringArea(r), 0), 0) * lngScale;
    return { code: properties.code, polygons, minLng, minLat, maxLng, maxLat, area };
  });
}

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 점이 들어 있는 읍·면·동 코드. 바다 등 어디에도 없으면 null.
export function regionAt(boundaries: IndexedBoundary[], point: Point): string | null {
  const { lng, lat } = point;
  for (const b of boundaries) {
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
    for (const [outer, ...holes] of b.polygons) {
      if (inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h))) return b.code;
    }
  }
  return null;
}

// 다트가 떨어질 점. 남은 지역 중 하나를 면적에 비례해 고르고(지도에 무작위로 던질 때처럼 넓은 곳이 잘 걸린다),
// 그 지역을 감싸는 사각형을 조금 넓힌 범위의 무작위 점에 떨어진다.
// 그래서 대부분은 남은 땅에 꽂히고, 해안이나 경계 근처에서는 바다·지워진 땅으로 빗나갈 수 있다.
// (남은 땅 전체를 감싸는 큰 사각형에 던지면 바다가 너무 넓어서 절반 넘게 3번 모두 빗나갔다)
export function randomDartPoint(boundaries: IndexedBoundary[], remaining: RegionLite[], random: () => number): Point {
  const allowed = new Set(remaining.map((r) => r.code));
  const targets = boundaries.filter((b) => allowed.has(b.code));
  const total = targets.reduce((sum, b) => sum + b.area, 0);
  let pick = random() * total;
  const target = targets.find((b) => (pick -= b.area) <= 0) ?? targets[targets.length - 1];

  const padLat = (target.maxLat - target.minLat) * AIM_SPREAD;
  const padLng = (target.maxLng - target.minLng) * AIM_SPREAD;
  return {
    lat: target.minLat - padLat + random() * (target.maxLat - target.minLat + 2 * padLat),
    lng: target.minLng - padLng + random() * (target.maxLng - target.minLng + 2 * padLng),
  };
}

export type DartResult = { point: Point; outcome: DartOutcome; regionCode: string | null };

// 한 번 던진 결과. attempt는 1부터 센다.
export function resolveDart(
  boundaries: IndexedBoundary[],
  remaining: RegionLite[],
  point: Point,
  attempt: number,
): DartResult {
  const code = regionAt(boundaries, point);
  const allowed = new Set(remaining.map((r) => r.code));
  if (code && allowed.has(code)) return { point, outcome: "hit", regionCode: code };
  if (attempt < MAX_ATTEMPTS) return { point, outcome: code ? "outside" : "sea", regionCode: null };

  // 마지막 시도도 실패: 떨어진 곳에서 가장 가까운 남은 지역(대표점)으로 옮긴다.
  let nearest = remaining[0];
  let best = Infinity;
  for (const r of remaining) {
    const d = distanceKm(point, r);
    if (d < best) {
      best = d;
      nearest = r;
    }
  }
  return { point: { lat: nearest.lat, lng: nearest.lng }, outcome: "snapped", regionCode: nearest.code };
}
