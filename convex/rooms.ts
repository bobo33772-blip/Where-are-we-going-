import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { origin as originValidator } from "./schema";
import { findRoom, hashToken, listPlayers, requireHost, requirePlayer, requireRoom, tokenArg } from "./lib/access";
import {
  generateRoomCode,
  HEARTBEAT_INTERVAL_MS,
  HOST_AWAY_MS,
  isValidOrigin,
  MAX_PLAYERS,
  validateNickname,
} from "../src/lib/room/rules";

function requireNickname(input: string): string {
  const result = validateNickname(input);
  if (!result.ok) throw new ConvexError(result.error);
  return result.value;
}

// 방 상태. 방이 없으면 null을 돌려준다.
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await findRoom(ctx, code);
    if (!room) return null;
    const players = await listPlayers(ctx, room);
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const throws = await ctx.db
      .query("throws")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    return {
      code: room.code,
      phase: room.phase,
      origin: room.origin ?? null,
      players: players.map((p) => ({
        id: p._id,
        nickname: p.nickname,
        turnOrder: p.turnOrder,
        isHost: p._id === room.hostPlayerId,
      })),
      currentRoundId: room.currentRoundId ?? null,
      throws: throws.map((t) => ({
        id: t._id,
        playerId: t.playerId,
        attempt: t.attempt,
        lat: t.lat,
        lng: t.lng,
        outcome: t.outcome,
        regionCode: t.regionCode ?? null,
        byHost: t.byHost,
      })),
      // 누가 어디를 골랐는지는 결과가 나온 뒤에만 보낸다.
      votedPlayerIds: votes.map((v) => v.playerId),
      votes: room.result ? votes.map((v) => ({ playerId: v.playerId, regionCode: v.regionCode })) : null,
      result: room.result ?? null,
      rounds: await Promise.all(
        rounds.map(async (r) => {
          const answers = await ctx.db
            .query("answers")
            .withIndex("by_round", (q) => q.eq("roundId", r._id))
            .collect();
          return {
            id: r._id,
            index: r.index,
            questionId: r.questionId,
            title: r.title,
            options: r.options,
            status: r.status,
            result: r.result ?? null,
            canContinue: r.canContinue ?? null,
            answeredPlayerIds: answers.map((a) => a.playerId),
            // 누가 무엇을 골랐는지는 공개된 질문만 보낸다. (공개 전에 다른 사람 선택이 새지 않게)
            votes: r.status === "revealed" ? answers.map((a) => ({ playerId: a.playerId, choice: a.choice })) : null,
          };
        }),
      ),
    };
  },
});

// 방 만들기: 만든 사람이 방장이 된다.
export const create = mutation({
  args: { nickname: v.string(), token: tokenArg },
  handler: async (ctx, { nickname, token }) => {
    const name = requireNickname(nickname);
    const tokenHash = await hashToken(token);

    // 코드가 이미 쓰이고 있으면 다시 뽑는다. (mutation은 트랜잭션이라 확인과 삽입 사이에 끼어들 수 없다)
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateRoomCode();
      if (await findRoom(ctx, code)) continue;

      const roomId = await ctx.db.insert("rooms", { code, phase: "lobby" });
      const playerId = await ctx.db.insert("players", { roomId, nickname: name, tokenHash, turnOrder: 1 });
      await ctx.db.patch(roomId, { hostPlayerId: playerId });
      return { code, playerId };
    }
    throw new ConvexError("방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  },
});

// 방 참여. mutation은 직렬화되므로 동시에 여러 명이 들어와도 정원과 차례 번호가 지켜진다.
export const join = mutation({
  args: { code: v.string(), nickname: v.string(), token: tokenArg },
  handler: async (ctx, { code, nickname, token }) => {
    const room = await requireRoom(ctx, code);
    const name = requireNickname(nickname);
    const tokenHash = await hashToken(token);

    if (room.phase !== "lobby") throw new ConvexError("이미 시작한 방이에요.");

    const players = await listPlayers(ctx, room);
    if (players.length >= MAX_PLAYERS) throw new ConvexError(`방이 가득 찼어요. (최대 ${MAX_PLAYERS}명)`);

    const taken = await ctx.db
      .query("players")
      .withIndex("by_room_nickname", (q) => q.eq("roomId", room._id).eq("nickname", name))
      .unique();
    if (taken) throw new ConvexError("이미 쓰고 있는 닉네임이에요.");

    const turnOrder = Math.max(0, ...players.map((p) => p.turnOrder)) + 1;
    const playerId = await ctx.db.insert("players", { roomId: room._id, nickname: name, tokenHash, turnOrder });
    return { playerId };
  },
});

// 출발지 정하기. 방장만, 시작 전에만 할 수 있다.
export const setOrigin = mutation({
  args: { code: v.string(), token: tokenArg, origin: originValidator },
  handler: async (ctx, { code, token, origin }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "출발지 정하기");
    if (room.phase !== "lobby") throw new ConvexError("이미 시작한 방이에요.");
    if (!isValidOrigin(origin)) throw new ConvexError("출발지 정보가 올바르지 않아요.");

    await ctx.db.patch(room._id, { origin: { ...origin, name: origin.name.trim() } });
  },
});

// 접속 표시용 하트비트
export const heartbeat = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    const now = Date.now();

    const existing = await ctx.db
      .query("presence")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    if (!existing) {
      await ctx.db.insert("presence", { roomId: room._id, playerId: player._id, lastSeenAt: now });
    } else if (now - existing.lastSeenAt > HEARTBEAT_INTERVAL_MS / 2) {
      // 새로고침 등으로 하트비트가 몰려도 쓰기는 줄인다.
      await ctx.db.patch(existing._id, { lastSeenAt: now });
    }
  },
});

// 참여자별 마지막 접속 시각. 접속 중인지는 브라우저가 현재 시각과 비교해 판단한다.
// (쿼리는 읽은 데이터가 바뀔 때만 다시 실행되고 시간이 흐르는 것만으로는 다시 실행되지 않으므로,
// 여기서 Date.now()로 판단하면 결과가 오래된 채로 남는다)
export const presence = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await findRoom(ctx, code);
    if (!room) return [];
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    return rows.map((r) => ({ playerId: r.playerId, lastSeenAt: r.lastSeenAt }));
  },
});

// 방장 넘기기 (방장이 직접)
export const transferHost = mutation({
  args: { code: v.string(), token: tokenArg, playerId: v.id("players") },
  handler: async (ctx, { code, token, playerId }) => {
    const room = await requireRoom(ctx, code);
    await requireHost(ctx, room, token, "방장 넘기기");
    const target = await ctx.db.get(playerId);
    if (!target || target.roomId !== room._id) throw new ConvexError("이 방의 참여자가 아니에요.");
    await ctx.db.patch(room._id, { hostPlayerId: target._id });
  },
});

// 방장 넘겨받기. 방장이 오래 접속하지 않아 진행이 멈췄을 때 다른 참여자가 이어받는다.
export const claimHost = mutation({
  args: { code: v.string(), token: tokenArg },
  handler: async (ctx, { code, token }) => {
    const room = await requireRoom(ctx, code);
    const player = await requirePlayer(ctx, room, token);
    if (player._id === room.hostPlayerId) return;

    const hostPresence = room.hostPlayerId
      ? await ctx.db
          .query("presence")
          .withIndex("by_player", (q) => q.eq("playerId", room.hostPlayerId!))
          .unique()
      : null;
    if (hostPresence && Date.now() - hostPresence.lastSeenAt < HOST_AWAY_MS) {
      throw new ConvexError("방장이 아직 접속해 있어요.");
    }
    await ctx.db.patch(room._id, { hostPlayerId: player._id });
  },
});
