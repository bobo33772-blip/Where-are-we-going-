"use client";

import type { Origin, PlayerSession, RoomState } from "./types";

// 방마다 내 참여 정보를 브라우저에 저장한다. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도
// 화면이 깨지지 않도록 모든 접근을 try/catch로 감싼다.
const sessionKey = (code: string) => `wawg:room:${code}`;

export function loadSession(code: string): PlayerSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    return typeof parsed.playerId === "string" && typeof parsed.token === "string"
      ? { playerId: parsed.playerId, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: PlayerSession) {
  try {
    localStorage.setItem(sessionKey(code), JSON.stringify(session));
  } catch {
    // 저장하지 못하면 새로고침 시 다시 참여해야 한다.
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(sessionKey(code));
  } catch {
    // 무시
  }
}

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (init?.token) headers.set("x-player-token", init.token);

  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "잠시 문제가 생겼어요.");
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = {
  createRoom: (nickname: string) =>
    request<{ code: string } & PlayerSession>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname }),
    }),

  joinRoom: (code: string, nickname: string) =>
    request<PlayerSession>(`/api/rooms/${code}/players`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    }),

  getRoom: (code: string) => request<RoomState>(`/api/rooms/${code}`),

  setOrigin: (code: string, token: string, origin: Origin) =>
    request<RoomState>(`/api/rooms/${code}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ origin }),
    }),
};
