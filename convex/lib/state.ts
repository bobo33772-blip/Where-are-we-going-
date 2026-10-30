// 여러 단계가 함께 쓰는 방 상태 계산

import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { REGIONS } from "./regions";
import { applyFilters } from "../../src/lib/game/filters";
import { chosenFilters } from "../../src/lib/game/questions";

export async function listRounds(ctx: QueryCtx, roomId: Id<"rooms">) {
  return ctx.db
    .query("rounds")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

// 기준 라운드에서 정한 기준을 모두 만족하는 "남은 땅"
export async function remainingRegions(ctx: QueryCtx, room: Doc<"rooms">) {
  if (!room.origin) return REGIONS;
  return applyFilters(REGIONS, room.origin, chosenFilters(await listRounds(ctx, room._id)));
}

export async function listThrows(ctx: QueryCtx, roomId: Id<"rooms">) {
  return ctx.db
    .query("throws")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

// 참여자별 최종 후보(꽂힌 곳). 아직 못 정한 사람은 빠진다.
export function finalThrows(throws: Doc<"throws">[]) {
  return throws.filter((t) => t.outcome === "hit" || t.outcome === "snapped");
}
