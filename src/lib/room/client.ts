"use client";

import { ConvexError } from "convex/values";
import type { PlayerSession } from "./types";

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

// 참여자 비밀 토큰. 서버에는 해시만 저장된다.
export function newPlayerToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Convex 함수가 던진 ConvexError는 사용자에게 보여줄 메시지를 담고 있다.
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return fallback;
}
