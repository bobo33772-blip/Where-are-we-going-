// 기준 라운드(밸런스 게임) 진행.
//
// 흐름: 방장이 시작 → 질문 하나를 낸다 → 모두 고르면(또는 방장이 공개하면) 결과 공개
//      → 방장이 다음 질문 → … → 방장이 기준 라운드를 끝내면 다트 라운드로 넘어간다.
// 공개된 질문의 선택지 기준이 쌓여서 다트를 던질 수 있는 지도가 줄어든다.

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { optionKey } from "./schema";
import { listPlayers, requireHost, requirePlayer, requireRoom, tokenArg } from "./lib/access";
import { REGIONS } from "./lib/regions";
import { chosenFilters, MAX_QUESTIONS, validCandidates, type OptionKey } from "../src/lib/game/questions";
import { MIN_PLAYERS_TO_START } from "../src/lib/room/rules";


async function listRounds(ctx: MutationCtx, roomId: Id<"rooms">) {
  return ctx.db
    .query("rounds")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

function nextCandidates(room: Doc<"rooms">, rounds: Doc<"rounds">[]) {
  if (!room.origin) return [];
  const revealedCount = rounds.filter((r) => r.status === "revealed").length;
  if (revealedCount >= MAX_QUESTIONS) return [];
  return validCandidates(
    REGIONS,
    room.origin,
    chosenFilters(rounds),
    rounds.map((r) => r.questionId),
  );
}

// 낼 수 있는 질문 중 하나를 골라 새 질문으로 연다. 낼 질문이 없으면 null.
async function openNextRound(ctx: MutationCtx, room: Doc<"rooms">, rounds: Doc<"rounds">[]) {
  const candidates = nextCandidates(room, rounds);
  if (candidates.length === 0) return null;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const roundId = await ctx.db.insert("rounds", {
    roomId: room._id,
    index: rounds.length + 1,
    questionId: picked.questionId,
    title: picked.title,
    options: picked.options.map((o, i) => ({ ...o, remaining: picked.remaining[i] })),
    status: "open",
  });
  await ctx.db.patch(room._id, { currentRoundId: roundId });
  return roundId;
}

async function requireCurrentRound(ctx: MutationCtx, room: Doc<"rooms">, roundId?: Id<"rounds">) {
  if (room.phase !== "criteria") throw new ConvexError("지금은 기준을 정하는 단계가 아니에요.");
  if (!room.currentRoundId || (roundId && roundId !== room.currentRoundId)) {
    throw new ConvexError("이미 지나간 질문이에요.");
  }
  const round = await ctx.db.get(room.currentRoundId);
  if (!round) throw new ConvexError("질문을 찾을 수 없어요.");
  return round;
}

// 응답을 세서 결과를 정한다. 동점이면 무작위(룰렛)로 정한다.
async function revealRound(ctx: MutationCtx, room: Doc<"rooms">, round: Doc<"rounds">) {
  const answers = await ctx.db
    .query("answers")
    .withIndex("by_round", (q) => q.eq("roundId", round._id))
    .collect();
  if (answers.length === 0) throw new ConvexError("아직 아무도 고르지 않았어요.");

  const votesA = answers.filter((a) => a.choice === "A").length;
  const votesB = answers.length - votesA;
  const tie = votesA === votesB;
  const choice: OptionKey = tie ? (Math.random() < 0.5 ? "A" : "B") : votesA > votesB ? "A" : "B";

  await ctx.db.patch(round._id, { status: "revealed", result: { choice, votesA, votesB, tie } });

  // 공개 결과를 반영한 상태로 다음 질문을 낼 수 있는지 미리 계산해 둔다.
  const rounds = await listRounds(ctx, room._id);
  await ctx.db.patch(round._id, { canContinue: nextCandidates(room, rounds).length > 0 });
}

// 게임 시작: 대기실 → 기준 라운드
export const start = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "게임 시작하기");
    if (room.phase !== "lobby") throw new ConvexError("이미 시작한 방이에요.");
    if (!room.origin) throw new ConvexError("출발지를 먼저 정해 주세요.");
    const players = await listPlayers(ctx, room);
    if (players.length < MIN_PLAYERS_TO_START) {
      throw new ConvexError(`친구가 ${MIN_PLAYERS_TO_START}명 이상 모여야 시작할 수 있어요.`);
    }

    await ctx.db.patch(room._id, { phase: "criteria" });
    const roundId = await openNextRound(ctx, { ...room, phase: "criteria" }, []);
    // 출발지가 어디든 첫 질문은 거의 항상 나오지만, 없으면 바로 다트 라운드로 간다.
    if (!roundId) await ctx.db.patch(room._id, { phase: "darts" });
  },
});

// 선택하기. 공개 전에는 다시 골라 바꿀 수 있다. 모두 고르면 자동으로 공개한다.
export const answer = mutation({
  args: { code: v.string(), token: tokenArg, roundId: v.id("rounds"), choice: optionKey },
  handler: async (ctx, { code, token, roundId, choice }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    const round = await requireCurrentRound(ctx, room, roundId);
    if (round.status !== "open") throw new ConvexError("이미 결과가 나온 질문이에요.");

    const existing = await ctx.db
      .query("answers")
      .withIndex("by_round", (q) => q.eq("roundId", round._id).eq("playerId", player._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { choice });
    } else {
      await ctx.db.insert("answers", { roomId: room._id, roundId: round._id, playerId: player._id, choice });
    }

    const [players, answers] = await Promise.all([
      listPlayers(ctx, room),
      ctx.db
        .query("answers")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect(),
    ]);
    if (answers.length >= players.length) await revealRound(ctx, room, round);
  },
});

// 결과 공개 (방장). 아직 안 고른 친구가 있어도 공개할 수 있다.
export const reveal = mutation({
  args: { code: v.string(), token: tokenArg, roundId: v.id("rounds") },
  handler: async (ctx, { code, token, roundId }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "결과 공개하기");
    const round = await requireCurrentRound(ctx, room, roundId);
    if (round.status !== "open") throw new ConvexError("이미 결과가 나온 질문이에요.");
    await revealRound(ctx, room, round);
  },
});

// 이 질문 건너뛰기 (방장). 지도는 그대로 두고 다른 질문을 낸다.
export const skip = mutation({
  args: { code: v.string(), token: tokenArg, roundId: v.id("rounds") },
  handler: async (ctx, { code, token, roundId }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "질문 건너뛰기");
    const round = await requireCurrentRound(ctx, room, roundId);
    if (round.status !== "open") throw new ConvexError("이미 결과가 나온 질문이에요.");

    await ctx.db.patch(round._id, { status: "skipped" });
    const rounds = await listRounds(ctx, room._id);
    const nextId = await openNextRound(ctx, room, rounds);
    if (!nextId) await ctx.db.patch(round._id, { canContinue: false });
  },
});

// 다음 질문 (방장)
export const next = mutation({
  args: { code: v.string(), token: tokenArg, roundId: v.id("rounds") },
  handler: async (ctx, { code, token, roundId }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "다음 질문 내기");
    const round = await requireCurrentRound(ctx, room, roundId);
    if (round.status === "open") throw new ConvexError("지금 질문의 결과를 먼저 공개해 주세요.");

    const rounds = await listRounds(ctx, room._id);
    const nextId = await openNextRound(ctx, room, rounds);
    // 오류를 던지면 아래 기록까지 되돌려지므로, 낼 질문이 없으면 표시만 하고 정상 종료한다.
    if (!nextId) await ctx.db.patch(round._id, { canContinue: false });
    return { done: !nextId };
  },
});

// 기준 라운드 끝내기 (방장) → 다트 라운드
export const finishCriteria = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "기준 라운드 끝내기");
    const round = await requireCurrentRound(ctx, room);
    if (round.status === "open") throw new ConvexError("지금 질문의 결과를 먼저 공개하거나 건너뛰어 주세요.");
    await ctx.db.patch(room._id, { phase: "darts" });
  },
});

// 내가 고른 답 (질문 id → 선택). 공개 전에도 자기 답은 볼 수 있다.
export const myAnswers = query({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    return Object.fromEntries(answers.map((a) => [a.roundId, a.choice])) as Record<string, OptionKey>;
  },
});
