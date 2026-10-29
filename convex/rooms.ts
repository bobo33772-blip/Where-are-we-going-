import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { origin as originValidator } from "./schema";
import {
  generateRoomCode,
  HEARTBEAT_INTERVAL_MS,
  isValidOrigin,
  MAX_PLAYERS,
  normalizeRoomCode,
  validateNickname,
} from "../src/lib/room/rules";

// 참여자 토큰은 브라우저가 만들어 보내고, 여기서는 해시만 저장한다.
// (Convex 함수 안의 난수는 결정적으로 시드되므로 비밀값 생성에 쓰지 않는다)
const tokenArg = v.string();

async function hashToken(token: string): Promise<string> {
  if (token.length < 32 || token.length > 128) throw new ConvexError("참여 정보가 올바르지 않아요.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function requireNickname(input: string): string {
  const result = validateNickname(input);
  if (!result.ok) throw new ConvexError(result.error);
  return result.value;
}

async function findRoom(ctx: QueryCtx, rawCode: string): Promise<Doc<"rooms"> | null> {
  const code = normalizeRoomCode(rawCode);
  if (!code) return null;
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

async function requireRoom(ctx: QueryCtx, rawCode: string): Promise<Doc<"rooms">> {
  const room = await findRoom(ctx, rawCode);
  if (!room) throw new ConvexError("방을 찾을 수 없어요.");
  return room;
}

// 토큰이 이 방의 어느 참여자인지 확인한다.
async function requirePlayer(ctx: QueryCtx, room: Doc<"rooms">, token: string): Promise<Doc<"players">> {
  const tokenHash = await hashToken(token);
  const player = await ctx.db
    .query("players")
    .withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("tokenHash", tokenHash))
    .unique();
  if (!player) throw new ConvexError("이 방의 참여자가 아니에요.");
  return player;
}

async function listPlayers(ctx: QueryCtx, room: Doc<"rooms">) {
  return ctx.db
    .query("players")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
}

// 방 상태. 방이 없으면 null을 돌려준다.
export const get = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await findRoom(ctx, code);
    if (!room) return null;
    const players = await listPlayers(ctx, room);
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
    const player = await requirePlayer(ctx, room, token);
    if (player._id !== room.hostPlayerId) throw new ConvexError("출발지는 방장만 정할 수 있어요.");
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
// (쿼리는 결과가 캐시되므로 여기서 Date.now()로 판단하면 시간이 지나도 갱신되지 않는다)
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
