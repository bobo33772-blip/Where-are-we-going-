import type { RoomState } from "@/lib/room/types";

export type Candidate = { regionCode: string; playerIds: string[] };

// 다트로 정해진 후보들. 같은 곳에 여러 명이 꽂았으면 하나로 묶는다. (차례 순서대로)
export function candidatesOf(room: RoomState): Candidate[] {
  const order = new Map(room.players.map((p) => [p.id, p.turnOrder]));
  const finals = room.throws
    .filter((t) => (t.outcome === "hit" || t.outcome === "snapped") && t.regionCode)
    .sort((a, b) => (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0));

  const byRegion = new Map<string, Candidate>();
  for (const t of finals) {
    const c = byRegion.get(t.regionCode!) ?? { regionCode: t.regionCode!, playerIds: [] };
    c.playerIds.push(t.playerId);
    byRegion.set(t.regionCode!, c);
  }
  return [...byRegion.values()];
}
