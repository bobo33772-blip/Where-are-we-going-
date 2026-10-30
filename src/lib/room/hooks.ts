"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../../../convex/_generated/api";
import { loadSession, saveSession } from "./client";
import { HEARTBEAT_INTERVAL_MS, HOST_AWAY_MS, ONLINE_WINDOW_MS } from "./rules";
import type { PlayerSession } from "./types";

const SESSION_CHANGED_EVENT = "wawg:session-changed";

function subscribeSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}

// 이 방에서의 내 참여 정보. 서버 렌더링 중에는 알 수 없으므로 undefined다.
export function usePlayerSession(code: string) {
  const raw = useSyncExternalStore(
    subscribeSession,
    () => JSON.stringify(loadSession(code)),
    () => undefined,
  );
  const session: PlayerSession | null | undefined = raw === undefined ? undefined : JSON.parse(raw);

  const save = useCallback(
    (next: PlayerSession) => {
      saveSession(code, next);
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    },
    [code],
  );

  return [session, save] as const;
}

// 내가 접속해 있다고 주기적으로 알린다. 화면이 숨겨져 있으면 보내지 않는다.
export function useHeartbeat(code: string, token: string | null) {
  const heartbeat = useMutation(api.rooms.heartbeat);

  useEffect(() => {
    if (!token) return;
    const beat = () => {
      if (document.visibilityState === "visible") heartbeat({ code, token }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [code, token, heartbeat]);
}

// 지금 접속 중인 참여자 id 목록. 시간이 지나면 저절로 오프라인으로 바뀌도록 주기적으로 다시 계산한다.
export function useOnlinePlayerIds(code: string): Set<string> {
  const { rows, now } = usePresence(code);
  return new Set((rows ?? []).filter((r) => now - r.lastSeenAt < ONLINE_WINDOW_MS).map((r) => r.playerId));
}

function usePresence(code: string) {
  const rows = useQuery(api.rooms.presence, { code });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  return { rows, now };
}

// 방장이 오래 접속하지 않았는지. 그러면 다른 참여자가 방장을 이어받을 수 있다. (서버도 같은 기준으로 확인한다)
export function useHostAway(code: string, hostId: string | null): boolean {
  const { rows, now } = usePresence(code);
  if (!rows || !hostId) return false;
  const host = rows.find((r) => r.playerId === hostId);
  return !host || now - host.lastSeenAt >= HOST_AWAY_MS;
}
