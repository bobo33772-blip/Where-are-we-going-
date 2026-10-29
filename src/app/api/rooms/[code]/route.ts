import { errorResponse, parseRoomCode, PLAYER_TOKEN_HEADER, readJson } from "@/lib/room/http";
import { getRoomState, RoomError, setOrigin } from "@/lib/room/service";
import type { Origin } from "@/lib/room/types";

// 방 상태 조회
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  try {
    const code = parseRoomCode((await ctx.params).code);
    return Response.json(await getRoomState(code), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// 방 설정 변경 (지금은 출발지만). 방장만 할 수 있다.
export async function PATCH(request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  try {
    const code = parseRoomCode((await ctx.params).code);
    const body = await readJson(request);
    const origin = parseOrigin(body.origin);
    const state = await setOrigin(code, request.headers.get(PLAYER_TOKEN_HEADER), origin);
    return Response.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}

function parseOrigin(input: unknown): Origin {
  const o = input as Partial<Origin> | null;
  const name = typeof o?.name === "string" ? o.name.trim() : "";
  const { lat, lng } = o ?? {};
  // 대한민국 범위를 대략 감싸는 경계 상자
  const valid =
    name.length > 0 &&
    name.length <= 40 &&
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= 33 &&
    lat <= 39 &&
    lng >= 124 &&
    lng <= 132;
  if (!valid) throw new RoomError(400, "출발지 정보가 올바르지 않아요.");
  return { name, lat, lng };
}
