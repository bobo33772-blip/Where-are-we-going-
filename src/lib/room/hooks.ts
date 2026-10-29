"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { api, ApiError, loadSession, saveSession } from "./client";
import { ROOM_UPDATED_EVENT, roomChannelName, type PlayerSession, type RoomState } from "./types";

// 실시간 알림을 놓쳤을 때를 대비한 주기적 새로고침 간격
const POLL_INTERVAL_MS = 15_000;
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

function tryGetBrowserClient() {
  try {
    return getBrowserClient();
  } catch (error) {
    console.warn("실시간 연결을 건너뜁니다.", error);
    return null;
  }
}

type RoomStatus =
  | { kind: "loading" }
  | { kind: "ready"; room: RoomState }
  | { kind: "error"; status: number; message: string };

// 방 상태를 불러오고, 바뀔 때마다(실시간 알림 또는 주기적 확인) 다시 불러온다.
// 같은 채널의 presence로 지금 접속해 있는 참여자도 알려준다.
export function useRoom(code: string, playerId: string | null) {
  const [status, setStatus] = useState<RoomStatus>({ kind: "loading" });
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(
    () =>
      api.getRoom(code).then(
        (room) => setStatus({ kind: "ready", room }),
        (error) => {
          const status = error instanceof ApiError ? error.status : 0;
          const message = error instanceof Error ? error.message : "방 정보를 불러오지 못했어요.";
          // 이미 화면에 방이 떠 있으면 일시적인 오류로 화면을 지우지 않는다.
          setStatus((prev) => (prev.kind === "ready" && status !== 404 ? prev : { kind: "error", status, message }));
        },
      ),
    [code],
  );

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const supabase = tryGetBrowserClient();
    if (!supabase) return;

    const channel = supabase.channel(roomChannelName(code), {
      config: { presence: { key: playerId ?? "" } },
    });

    channel
      .on("broadcast", { event: ROOM_UPDATED_EVENT }, () => void refresh())
      .on("presence", { event: "sync" }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState()).filter(Boolean)));
      })
      .subscribe((state) => {
        if (state === "SUBSCRIBED" && playerId) void channel.track({ playerId });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [code, playerId, refresh]);

  return { status, onlineIds, refresh, setRoom: (room: RoomState) => setStatus({ kind: "ready", room }) };
}
