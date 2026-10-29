import "server-only";
import { normalizeRoomCode } from "./rules";
import { RoomError } from "./service";

export const PLAYER_TOKEN_HEADER = "x-player-token";

export function errorResponse(error: unknown): Response {
  if (error instanceof RoomError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "잠시 문제가 생겼어요. 다시 시도해 주세요." }, { status: 500 });
}

export function parseRoomCode(raw: string): string {
  const code = normalizeRoomCode(raw);
  if (!code) throw new RoomError(404, "방을 찾을 수 없어요.");
  return code;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // 아래에서 공통 오류로 처리
  }
  throw new RoomError(400, "요청 형식이 올바르지 않아요.");
}
