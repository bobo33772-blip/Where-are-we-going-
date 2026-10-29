import { errorResponse, readJson } from "@/lib/room/http";
import { validateNickname } from "@/lib/room/rules";
import { createRoom } from "@/lib/room/service";

// 방 만들기: 만든 사람이 방장이 된다.
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const nickname = validateNickname(body.nickname);
    if (!nickname.ok) return Response.json({ error: nickname.error }, { status: 400 });

    const session = await createRoom(nickname.value);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
