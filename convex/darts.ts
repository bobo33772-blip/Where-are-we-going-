// 다트 라운드와 최종 투표.
//
// 다트: 차례대로 한 명씩 던진다. 착지 지점과 결과는 서버가 정한다. (모두 같은 결과를 보고, 조작할 수 없게)
//      남은 땅이 아니면 다시 던지고, 3번째도 실패하면 가장 가까운 남은 지역으로 옮긴다.
// 투표: 모두의 후보 중 하나에 투표한다. 모두 투표하면(또는 방장이 공개하면) 결과가 나오고, 동점이면 무작위로 정한다.

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { listPlayers, requireHost, requirePlayer, requireRoom, tokenArg } from "./lib/access";
import { boundaryIndex } from "./lib/regions";
import { finalThrows, listThrows, remainingRegions } from "./lib/state";
import { randomDartPoint, resolveDart } from "../src/lib/game/darts";

// 아직 후보가 없는 사람 중 차례가 가장 빠른 사람
function currentThrower(players: Doc<"players">[], throws: Doc<"throws">[]) {
  const done = new Set(finalThrows(throws).map((t) => t.playerId));
  return [...players].sort((a, b) => a.turnOrder - b.turnOrder).find((p) => !done.has(p._id)) ?? null;
}

// 다트 던지기. 자기 차례인 사람이 던지고, 방장은 자리를 비운 친구 대신 던질 수 있다.
export const throwDart = mutation({
  // expected*: 던지는 사람이 화면에서 본 차례와 시도. 그사이 차례가 넘어갔으면 거부한다.
  // (방장의 "대신 던지기"가 늦게 도착해 다음 사람 차례를 써 버리는 것을 막는다)
  args: { code: v.string(), token: tokenArg, expectedPlayerId: v.id("players"), expectedAttempt: v.number() },
  handler: async (ctx, { code, token, expectedPlayerId, expectedAttempt }) => {
    const room = await requireRoom(ctx, code);
    const caller = await requirePlayer(ctx, room, token);
    if (room.phase !== "darts") throw new ConvexError("지금은 다트를 던지는 단계가 아니에요.");

    const [players, throws] = await Promise.all([listPlayers(ctx, room), listThrows(ctx, room._id)]);
    const thrower = currentThrower(players, throws);
    if (!thrower) throw new ConvexError("모두 다트를 던졌어요.");
    const byHost = thrower._id !== caller._id;
    if (byHost && caller._id !== room.hostPlayerId) throw new ConvexError(`지금은 ${thrower.nickname}님 차례예요.`);

    const remaining = await remainingRegions(ctx, room);
    const attempt = throws.filter((t) => t.playerId === thrower._id).length + 1;
    if (thrower._id !== expectedPlayerId || attempt !== expectedAttempt) {
      throw new ConvexError("그사이 차례가 바뀌었어요. 화면을 확인하고 다시 눌러 주세요.");
    }
    const boundaries = boundaryIndex();
    const point = randomDartPoint(boundaries, remaining, Math.random);
    const result = resolveDart(boundaries, remaining, point, attempt);

    await ctx.db.insert("throws", {
      roomId: room._id,
      playerId: thrower._id,
      attempt,
      lat: result.point.lat,
      lng: result.point.lng,
      outcome: result.outcome,
      regionCode: result.regionCode ?? undefined,
      byHost,
    });
    return { outcome: result.outcome, regionCode: result.regionCode };
  },
});

// 투표로 넘어가기 (방장). 후보가 하나뿐이면 투표 없이 바로 결과로 간다.
export const startVote = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "투표 시작하기");
    if (room.phase !== "darts") throw new ConvexError("지금은 다트를 던지는 단계가 아니에요.");

    const [players, throws] = await Promise.all([listPlayers(ctx, room), listThrows(ctx, room._id)]);
    if (currentThrower(players, throws)) throw new ConvexError("아직 다트를 안 던진 친구가 있어요.");

    const candidates = [...new Set(finalThrows(throws).map((t) => t.regionCode!))];
    if (candidates.length === 1) {
      await ctx.db.patch(room._id, {
        phase: "result",
        result: { regionCode: candidates[0], votes: 0, tie: false, unanimous: true },
      });
      return;
    }
    await ctx.db.patch(room._id, { phase: "vote" });
  },
});

async function candidateCodes(ctx: MutationCtx, room: Doc<"rooms">) {
  return new Set(finalThrows(await listThrows(ctx, room._id)).map((t) => t.regionCode!));
}

// 표를 세서 결과를 정한다. 동점이면 무작위(룰렛)로 정한다.
async function revealVote(ctx: MutationCtx, room: Doc<"rooms">) {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  if (votes.length === 0) throw new ConvexError("아직 아무도 투표하지 않았어요.");

  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.regionCode, (counts.get(vote.regionCode) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, n]) => n === top).map(([code]) => code);
  const regionCode = leaders[Math.floor(Math.random() * leaders.length)];

  await ctx.db.patch(room._id, {
    phase: "result",
    result: { regionCode, votes: top, tie: leaders.length > 1, unanimous: false },
  });
}

// 투표하기. 결과가 나오기 전에는 바꿀 수 있다. 모두 투표하면 자동으로 공개한다.
export const castVote = mutation({
  args: { code: v.string(), token: tokenArg, regionCode: v.string() },
  handler: async (ctx, { code, token, regionCode }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    if (room.phase !== "vote") throw new ConvexError("지금은 투표하는 단계가 아니에요.");
    if (!(await candidateCodes(ctx, room)).has(regionCode)) throw new ConvexError("후보에 없는 곳이에요.");

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_room_player", (q) => q.eq("roomId", room._id).eq("playerId", player._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { regionCode });
    } else {
      await ctx.db.insert("votes", { roomId: room._id, playerId: player._id, regionCode });
    }

    const [players, votes] = await Promise.all([
      listPlayers(ctx, room),
      ctx.db
        .query("votes")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect(),
    ]);
    if (votes.length >= players.length) await revealVote(ctx, room);
  },
});

// 투표 결과 공개 (방장). 아직 투표 안 한 친구가 있어도 공개할 수 있다.
export const revealVotes = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "투표 결과 공개하기");
    if (room.phase !== "vote") throw new ConvexError("지금은 투표하는 단계가 아니에요.");
    await revealVote(ctx, room);
  },
});

// 내가 투표한 곳. 결과 공개 전에도 자기 표는 볼 수 있다.
export const myVote = query({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    const vote = await ctx.db
      .query("votes")
      .withIndex("by_room_player", (q) => q.eq("roomId", room._id).eq("playerId", player._id))
      .unique();
    return vote?.regionCode ?? null;
  },
});
