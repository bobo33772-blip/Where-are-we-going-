// 방 관련 규칙. Convex 함수와 브라우저 양쪽에서 쓴다.

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;
export const NICKNAME_MAX_LENGTH = 12;
export const ORIGIN_NAME_MAX_LENGTH = 40;

// 접속 표시: 이 간격으로 하트비트를 보내고, 이 시간 안에 신호가 있었으면 접속 중으로 본다.
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const ONLINE_WINDOW_MS = 75_000;
// 방장이 이만큼 접속 신호가 없으면 다른 참여자가 방장을 넘겨받을 수 있다.
export const HOST_AWAY_MS = 120_000;

// 헷갈리기 쉬운 문자(0/O, 1/I/L)는 뺐다.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

// 방 코드는 비밀이 아니라 공유용이므로 Math.random으로 충분하다.
export function generateRoomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

// 앞뒤 공백을 지우고 연속 공백을 하나로 줄인다. 형식이 틀리면 오류 메시지를 돌려준다.
export function validateNickname(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "닉네임을 입력해 주세요." };
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length === 0) return { ok: false, error: "닉네임을 입력해 주세요." };
  if ([...value].length > NICKNAME_MAX_LENGTH) {
    return { ok: false, error: `닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요.` };
  }
  return { ok: true, value };
}

// 대한민국을 대략 감싸는 경계 상자 안의 좌표인지 확인한다.
export function isValidOrigin(origin: { name: string; lat: number; lng: number }): boolean {
  const name = origin.name.trim();
  return (
    name.length > 0 &&
    name.length <= ORIGIN_NAME_MAX_LENGTH &&
    origin.lat >= 33 &&
    origin.lat <= 39 &&
    origin.lng >= 124 &&
    origin.lng <= 132
  );
}
