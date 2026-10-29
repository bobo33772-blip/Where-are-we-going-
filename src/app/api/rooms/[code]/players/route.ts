import { errorResponse, parseRoomCode, readJson } from "@/lib/room/http";
import { validateNickname } from "@/lib/room/rules";
import { joinRoom } from "@/lib/room/service";

// 방 참여
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/players">) {
  try {
    const code = parseRoomCode((await ctx.params).code);
    const body = await readJson(request);
    const nickname = validateNickname(body.nickname);
    if (!nickname.ok) return Response.json({ error: nickname.error }, { status: 400 });

    const session = await joinRoom(code, nickname.value);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
