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

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    phase,
    // 방을 만들 때 방장 참여자를 같은 트랜잭션에서 넣으므로 처음에만 잠깐 비어 있다.
    hostPlayerId: v.optional(v.id("players")),
    origin: v.optional(origin),
  }).index("by_code", ["code"]),

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
