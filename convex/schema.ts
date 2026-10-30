import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const phase = v.union(
  v.literal("lobby"),
  v.literal("criteria"),
  v.literal("darts"),
  v.literal("vote"),
  v.literal("result"),
);

export const origin = v.object({
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
});

// src/lib/game/filters.ts의 RegionFilter와 같은 모양
export const regionFilter = v.union(
  v.object({ kind: v.literal("distance"), maxKm: v.optional(v.number()), minKm: v.optional(v.number()) }),
  v.object({ kind: v.literal("type"), types: v.array(v.union(v.literal("동"), v.literal("읍"), v.literal("면"))) }),
  v.object({ kind: v.literal("sido"), include: v.optional(v.array(v.string())), exclude: v.optional(v.array(v.string())) }),
  v.object({
    kind: v.literal("direction"),
    side: v.union(v.literal("north"), v.literal("south"), v.literal("east"), v.literal("west")),
  }),
);

export const optionKey = v.union(v.literal("A"), v.literal("B"));

const roundOption = v.object({
  key: optionKey,
  emoji: v.string(),
  label: v.string(),
  detail: v.string(),
  filter: regionFilter,
  // 이 선택지를 고르면 남는 읍·면·동 수 (질문을 낼 때 서버가 계산)
  remaining: v.number(),
});

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    phase,
    // 방을 만들 때 방장 참여자를 같은 트랜잭션에서 넣으므로 처음에만 잠깐 비어 있다.
    hostPlayerId: v.optional(v.id("players")),
    origin: v.optional(origin),
    // 기준 라운드에서 지금 보고 있는 질문
    currentRoundId: v.optional(v.id("rounds")),
  }).index("by_code", ["code"]),

  // 기준 라운드의 질문 하나. 낼 때의 선택지와 기준을 그대로 저장해서, 나중에 질문 목록이 바뀌어도 기록이 유지된다.
  rounds: defineTable({
    roomId: v.id("rooms"),
    index: v.number(),
    questionId: v.string(),
    title: v.string(),
    options: v.array(roundOption),
    status: v.union(v.literal("open"), v.literal("revealed"), v.literal("skipped")),
    result: v.optional(
      v.object({
        choice: optionKey,
        votesA: v.number(),
        votesB: v.number(),
        // 동점이라 룰렛으로 정했는지
        tie: v.boolean(),
      }),
    ),
    // 공개·건너뛰기 뒤에 다음 질문을 낼 수 있는지 (최대 질문 수, 남은 유효 질문으로 판단)
    canContinue: v.optional(v.boolean()),
  }).index("by_room", ["roomId", "index"]),

  // 질문별 응답. 공개 전에는 누가 무엇을 골랐는지 다른 참여자에게 보내지 않는다.
  answers: defineTable({
    roomId: v.id("rooms"),
    roundId: v.id("rounds"),
    playerId: v.id("players"),
    choice: optionKey,
  })
    .index("by_round", ["roundId", "playerId"])
    .index("by_player", ["playerId"]),

  // 로그인이 없으므로 참여자는 방에 들어올 때 만든 비밀 토큰으로 자신을 증명한다.
  // DB에는 토큰의 SHA-256 해시만 저장하고, 클라이언트로 내보내지 않는다.
  players: defineTable({
    roomId: v.id("rooms"),
    nickname: v.string(),
    tokenHash: v.string(),
    turnOrder: v.number(),
  })
    .index("by_room", ["roomId", "turnOrder"])
    .index("by_room_nickname", ["roomId", "nickname"])
    .index("by_room_token", ["roomId", "tokenHash"]),

  // 접속 표시용 하트비트. 방 상태와 분리해서, 하트비트가 방 화면 전체를 다시 계산시키지 않게 한다.
  presence: defineTable({
    roomId: v.id("rooms"),
    playerId: v.id("players"),
    lastSeenAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_player", ["playerId"]),
});
