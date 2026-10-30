// 기준(필터)으로 남은 읍·면·동을 계산한다. Convex 함수와 브라우저가 같은 코드를 써서
// 서버가 센 "남은 곳 수"와 화면에 칠해지는 지도가 항상 일치하게 한다.

export type RegionType = "동" | "읍" | "면";

export type RegionLite = {
  code: string;
  name: string;
  fullName: string;
  sido: string;
  sgg: string;
  lat: number;
  lng: number;
};

export type Point = { lat: number; lng: number };

export type RegionFilter =
  // 출발지에서 대표점까지 직선거리. maxKm 이하, minKm 초과
  | { kind: "distance"; maxKm?: number; minKm?: number }
  | { kind: "type"; types: RegionType[] }
  | { kind: "sido"; include?: string[]; exclude?: string[] }
  // 출발지보다 북/남/동/서. 남·서는 경계선(출발지와 같은 위도·경도)을 포함한다.
  | { kind: "direction"; side: "north" | "south" | "east" | "west" };

export const regionType = (r: RegionLite): RegionType => r.name.at(-1) as RegionType;

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function matches(region: RegionLite, origin: Point, filter: RegionFilter): boolean {
  switch (filter.kind) {
    case "distance": {
      const d = distanceKm(origin, region);
      return (filter.maxKm === undefined || d <= filter.maxKm) && (filter.minKm === undefined || d > filter.minKm);
    }
    case "type":
      return filter.types.includes(regionType(region));
    case "sido":
      return (
        (filter.include === undefined || filter.include.includes(region.sido)) &&
        (filter.exclude === undefined || !filter.exclude.includes(region.sido))
      );
    case "direction":
      switch (filter.side) {
        case "north":
          return region.lat > origin.lat;
        case "south":
          return region.lat <= origin.lat;
        case "east":
          return region.lng > origin.lng;
        case "west":
          return region.lng <= origin.lng;
      }
  }
}

export function applyFilters(regions: RegionLite[], origin: Point, filters: RegionFilter[]): RegionLite[] {
  return regions.filter((r) => filters.every((f) => matches(r, origin, f)));
}
