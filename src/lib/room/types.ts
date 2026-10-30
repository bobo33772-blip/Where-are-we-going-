import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
export type PlayerView = RoomState["players"][number];
export type Origin = NonNullable<RoomState["origin"]>;
export type RoundView = RoomState["rounds"][number];

// 방을 만들거나 참여했을 때 브라우저에 저장하는 내 정보
export type PlayerSession = {
  playerId: string;
  token: string;
};
