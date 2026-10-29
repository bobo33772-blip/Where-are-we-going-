// 방 관련 규칙. 서버와 브라우저 양쪽에서 쓴다.

export const MAX_PLAYERS = 8;
export const NICKNAME_MAX_LENGTH = 12;

// 헷갈리기 쉬운 문자(0/O, 1/I/L)는 뺐다.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
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
