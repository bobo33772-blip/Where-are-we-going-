// 방 찾기와 참여자 확인. 여러 Convex 함수 파일이 함께 쓴다.

import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { normalizeRoomCode } from "../../src/lib/room/rules";

// 참여자 토큰은 브라우저가 만들어 보내고, 여기서는 해시만 저장한다.
// (Convex 함수 안의 난수는 결정적으로 시드되므로 비밀값 생성에 쓰지 않는다)
export const tokenArg = v.string();

export async function hashToken(token: string): Promise<string> {
  if (token.length < 32 || token.length > 128) throw new ConvexError("참여 정보가 올바르지 않아요.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function findRoom(ctx: QueryCtx, rawCode: string): Promise<Doc<"rooms"> | null> {
  const code = normalizeRoomCode(rawCode);
  if (!code) return null;
  return ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

export async function requireRoom(ctx: QueryCtx, rawCode: string): Promise<Doc<"rooms">> {
  const room = await findRoom(ctx, rawCode);
  if (!room) throw new ConvexError("방을 찾을 수 없어요.");
  return room;
}

// 토큰이 이 방의 어느 참여자인지 확인한다.
export async function requirePlayer(ctx: QueryCtx, room: Doc<"rooms">, token: string): Promise<Doc<"players">> {
  const tokenHash = await hashToken(token);
  const player = await ctx.db
    .query("players")
    .withIndex("by_room_token", (q) => q.eq("roomId", room._id).eq("tokenHash", tokenHash))
    .unique();
  if (!player) throw new ConvexError("이 방의 참여자가 아니에요.");
  return player;
}

export async function requireHost(ctx: QueryCtx, room: Doc<"rooms">, token: string, action: string) {
  const player = await requirePlayer(ctx, room, token);
  if (player._id !== room.hostPlayerId) throw new ConvexError(`${action}는 방장만 할 수 있어요.`);
  return player;
}

export async function listPlayers(ctx: QueryCtx, room: Doc<"rooms">) {
  return ctx.db
    .query("players")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
}
