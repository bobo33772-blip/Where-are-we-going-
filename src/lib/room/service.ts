import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateRoomCode, MAX_PLAYERS } from "./rules";
import {
  ROOM_UPDATED_EVENT,
  roomChannelName,
  type Origin,
  type PlayerSession,
  type RoomPhase,
  type RoomState,
} from "./types";

export class RoomError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

// Postgres 오류 코드: 23505 = unique 위반
const UNIQUE_VIOLATION = "23505";

export async function createRoom(nickname: string): Promise<{ code: string } & PlayerSession> {
  const db = getAdminClient();
  const token = newToken();

  // 코드가 이미 쓰이고 있으면 몇 번 다시 뽑는다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await db
      .rpc("create_room", { p_code: code, p_nickname: nickname, p_token_hash: hashToken(token) })
      .single<{ room_id: string; player_id: string }>();

    if (!error) return { code, playerId: data.player_id, token };
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }
  throw new RoomError(503, "방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export async function joinRoom(code: string, nickname: string): Promise<PlayerSession> {
  const db = getAdminClient();
  const token = newToken();

  const { data, error } = await db.rpc("join_room", {
    p_code: code,
    p_nickname: nickname,
    p_token_hash: hashToken(token),
    p_max_players: MAX_PLAYERS,
  });

  if (error) {
    if (error.message === "room_not_found") throw new RoomError(404, "방을 찾을 수 없어요.");
    if (error.message === "room_started") throw new RoomError(409, "이미 시작한 방이에요.");
    if (error.message === "room_full") throw new RoomError(409, `방이 가득 찼어요. (최대 ${MAX_PLAYERS}명)`);
    if (error.code === UNIQUE_VIOLATION) throw new RoomError(409, "이미 쓰고 있는 닉네임이에요.");
    throw error;
  }

  await notifyRoomUpdated(code);
  return { playerId: data as string, token };
}

type RoomRow = {
  id: string;
  code: string;
  phase: RoomPhase;
  host_player_id: string | null;
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  players: { id: string; nickname: string; turn_order: number; token_hash: string }[];
};

async function loadRoom(code: string): Promise<RoomRow> {
  const { data, error } = await getAdminClient()
    .from("rooms")
    // rooms↔players 관계가 둘(소속 방, 방장)이라 어떤 외래 키로 묶을지 명시한다.
    .select(
      "id, code, phase, host_player_id, origin_name, origin_lat, origin_lng, players!players_room_id_fkey(id, nickname, turn_order, token_hash)",
    )
    .eq("code", code)
    .maybeSingle<RoomRow>();

  if (error) throw error;
  if (!data) throw new RoomError(404, "방을 찾을 수 없어요.");
  return data;
}

function toRoomState(row: RoomRow): RoomState {
  return {
    code: row.code,
    phase: row.phase,
    origin:
      row.origin_name !== null && row.origin_lat !== null && row.origin_lng !== null
        ? { name: row.origin_name, lat: row.origin_lat, lng: row.origin_lng }
        : null,
    players: row.players
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        turnOrder: p.turn_order,
        isHost: p.id === row.host_player_id,
      }))
      .sort((a, b) => a.turnOrder - b.turnOrder),
  };
}

export async function getRoomState(code: string): Promise<RoomState> {
  return toRoomState(await loadRoom(code));
}

// 요청 헤더의 토큰이 이 방의 어느 참여자인지 확인한다.
function authenticate(room: RoomRow, token: string | null) {
  if (!token) throw new RoomError(401, "방에 먼저 참여해 주세요.");
  const tokenHash = hashToken(token);
  const player = room.players.find((p) => p.token_hash === tokenHash);
  if (!player) throw new RoomError(401, "이 방의 참여자가 아니에요.");
  return player;
}

export async function setOrigin(code: string, token: string | null, origin: Origin): Promise<RoomState> {
  const room = await loadRoom(code);
  const player = authenticate(room, token);
  if (player.id !== room.host_player_id) throw new RoomError(403, "출발지는 방장만 정할 수 있어요.");
  if (room.phase !== "lobby") throw new RoomError(409, "이미 시작한 방이에요.");

  const { error } = await getAdminClient()
    .from("rooms")
    .update({ origin_name: origin.name, origin_lat: origin.lat, origin_lng: origin.lng })
    .eq("id", room.id);
  if (error) throw error;

  await notifyRoomUpdated(code);
  return getRoomState(code);
}

// 방 상태가 바뀌었다고 참여자들에게 알린다. 받은 쪽은 상태를 다시 불러온다.
// 알림이 실패해도 요청 자체는 성공으로 처리한다. (참여자 화면은 주기적으로도 새로고침한다)
async function notifyRoomUpdated(code: string) {
  const db = getAdminClient();
  const channel = db.channel(roomChannelName(code));
  try {
    const result = await channel.httpSend(ROOM_UPDATED_EVENT, {});
    if (!result.success) console.warn(`실시간 알림 실패 (${code}): ${result.status} ${result.error}`);
  } catch (error) {
    console.warn(`실시간 알림 실패 (${code})`, error);
  } finally {
    await db.removeChannel(channel);
  }
}
