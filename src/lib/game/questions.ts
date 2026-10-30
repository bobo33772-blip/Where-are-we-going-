// 기준 라운드(밸런스 게임) 질문 목록. 모든 질문은 우리가 가진 데이터(거리, 동·읍·면, 방향, 시도)로
// 실제로 지도를 줄일 수 있는 것만 넣었다. 여행 인프라 질문은 관광 데이터를 모은 뒤 추가한다.

import { applyFilters, distanceKm, regionType, type Point, type RegionFilter, type RegionLite } from "./filters";

// 한 판에 묻는 최대 질문 수 (공개까지 간 질문 기준)
export const MAX_QUESTIONS = 5;
// 어느 쪽을 골라도 최소한 이만큼은 남아야 그 질문을 낸다. (다트 던질 땅이 너무 좁아지지 않게)
export const MIN_REMAINING = 20;

export type OptionKey = "A" | "B";

export type QuestionOption = {
  key: OptionKey;
  emoji: string;
  label: string;
  detail: string;
  filter: RegionFilter;
};

export type BuiltQuestion = {
  questionId: string;
  title: string;
  options: [QuestionOption, QuestionOption];
};

type Context = { origin: Point; remaining: RegionLite[] };

type QuestionDef = {
  id: string;
  build: (ctx: Context) => Omit<BuiltQuestion, "questionId"> | null;
};

const CAPITAL_AREA = ["서울특별시", "경기도", "인천광역시"];
const JEJU = ["제주특별자치도"];

const option = (key: OptionKey, emoji: string, label: string, detail: string, filter: RegionFilter): QuestionOption => ({
  key,
  emoji,
  label,
  detail,
  filter,
});

export const QUESTIONS: QuestionDef[] = [
  {
    id: "daytrip",
    build: () => ({
      title: "당일치기 vs 1박 필수",
      options: [
        option("A", "🚗", "당일치기 가능한 거리", "출발지에서 직선 100km 이내", { kind: "distance", maxKm: 100 }),
        option("B", "🛏️", "자고 와야 하는 거리", "출발지에서 직선 100km 넘게", { kind: "distance", minKm: 100 }),
      ],
    }),
  },
  {
    // 남은 곳들의 거리 중앙값으로 나눠서, 출발지가 어디든 반반에 가깝게 갈리게 한다.
    id: "near-far",
    build: ({ origin, remaining }) => {
      if (remaining.length === 0) return null;
      const distances = remaining.map((r) => distanceKm(origin, r)).sort((a, b) => a - b);
      const median = Math.round(distances[Math.floor(distances.length / 2)] / 10) * 10;
      if (median < 10) return null;
      return {
        title: "가까운 쪽 vs 먼 쪽",
        options: [
          option("A", "📍", "가까운 쪽", `출발지에서 직선 ${median}km 이내`, { kind: "distance", maxKm: median }),
          option("B", "🚀", "먼 쪽", `출발지에서 직선 ${median}km 넘게`, { kind: "distance", minKm: median }),
        ],
      };
    },
  },
  {
    id: "city-country",
    build: () => ({
      title: "북적이는 동네 vs 한적한 시골",
      options: [
        option("A", "🏙️", "북적이는 동네", "행정구역이 '동'인 곳", { kind: "type", types: ["동"] }),
        option("B", "🌾", "한적한 시골", "행정구역이 '읍·면'인 곳", { kind: "type", types: ["읍", "면"] }),
      ],
    }),
  },
  {
    // '동'이 남아 있을 때 내면 어느 쪽을 골라도 도시가 통째로 빠지므로, 시골을 고른 뒤에만 낸다.
    id: "town-village",
    build: ({ remaining }) =>
      remaining.some((r) => regionType(r) === "동") ? null : {
      title: "읍내 구경 vs 찐 시골",
      options: [
        option("A", "🏪", "읍내 구경", "행정구역이 '읍'인 곳", { kind: "type", types: ["읍"] }),
        option("B", "🐄", "찐 시골", "행정구역이 '면'인 곳", { kind: "type", types: ["면"] }),
      ],
    },
  },
  {
    id: "east-west",
    build: () => ({
      title: "해 뜨는 쪽 vs 해 지는 쪽",
      options: [
        option("A", "🌅", "해 뜨는 동쪽", "출발지보다 동쪽", { kind: "direction", side: "east" }),
        option("B", "🌇", "해 지는 서쪽", "출발지보다 서쪽", { kind: "direction", side: "west" }),
      ],
    }),
  },
  {
    id: "north-south",
    build: () => ({
      title: "위로 갈까 vs 아래로 갈까",
      options: [
        option("A", "⬆️", "위로 (북쪽)", "출발지보다 북쪽", { kind: "direction", side: "north" }),
        option("B", "⬇️", "아래로 (남쪽)", "출발지보다 남쪽", { kind: "direction", side: "south" }),
      ],
    }),
  },
  {
    id: "capital-area",
    build: () => ({
      title: "수도권 vs 비수도권",
      options: [
        option("A", "🚇", "수도권", "서울·경기·인천", { kind: "sido", include: CAPITAL_AREA }),
        option("B", "🏞️", "비수도권", "서울·경기·인천 말고", { kind: "sido", exclude: CAPITAL_AREA }),
      ],
    }),
  },
  {
    id: "jeju",
    build: () => ({
      title: "제주도 vs 육지",
      options: [
        option("A", "🍊", "제주도", "제주특별자치도", { kind: "sido", include: JEJU }),
        option("B", "⛰️", "육지", "제주 말고", { kind: "sido", exclude: JEJU }),
      ],
    }),
  },
];

export type QuestionCandidate = BuiltQuestion & { remaining: [number, number] };

// 아직 안 낸 질문 중에서, 어느 쪽을 골라도 지도가 실제로 줄어들고 MIN_REMAINING곳 이상 남는 질문들.
export function validCandidates(
  regions: RegionLite[],
  origin: Point,
  filters: RegionFilter[],
  askedIds: string[],
): QuestionCandidate[] {
  const remaining = applyFilters(regions, origin, filters);
  const candidates: QuestionCandidate[] = [];
  for (const def of QUESTIONS) {
    if (askedIds.includes(def.id)) continue;
    const built = def.build({ origin, remaining });
    if (!built) continue;
    const counts = built.options.map((o) => applyFilters(remaining, origin, [o.filter]).length) as [number, number];
    const valid = counts.every((c) => c >= MIN_REMAINING && c < remaining.length);
    if (valid) candidates.push({ questionId: def.id, ...built, remaining: counts });
  }
  return candidates;
}

type RoundLike = {
  status: "open" | "revealed" | "skipped";
  result?: { choice: OptionKey } | null;
  options: { key: OptionKey; filter: RegionFilter }[];
};

// 공개된 질문에서 고른 선택지의 기준들. 이 기준을 모두 만족하는 곳이 "남은 땅"이다.
export function chosenFilters(rounds: RoundLike[]): RegionFilter[] {
  return rounds.flatMap((r) => {
    if (r.status !== "revealed" || !r.result) return [];
    const chosen = r.options.find((o) => o.key === r.result!.choice);
    return chosen ? [chosen.filter] : [];
  });
}
