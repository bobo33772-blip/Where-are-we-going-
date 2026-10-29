"use client";

import { useMutation } from "convex/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, ErrorText } from "@/components/ui";
import { errorMessage } from "@/lib/room/client";
import { useHeartbeat, useOnlinePlayerIds } from "@/lib/room/hooks";
import { MAX_PLAYERS } from "@/lib/room/rules";
import type { Origin, PlayerView, RoomState } from "@/lib/room/types";
import { OriginPicker } from "./OriginPicker";

// 지도 라이브러리는 브라우저에서만 동작한다.
const RegionMap = dynamic(() => import("@/components/map/RegionMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line" />,
});

const MIN_PLAYERS_TO_START = 2;

type Props = {
  room: RoomState;
  me: PlayerView;
  token: string;
};

export function Lobby({ room, me, token }: Props) {
  const setOrigin = useMutation(api.rooms.setOrigin);
  const [originError, setOriginError] = useState<string | null>(null);
  const [savingOrigin, setSavingOrigin] = useState(false);

  useHeartbeat(room.code, token);
  const onlineIds = useOnlinePlayerIds(room.code);

  async function handleOriginChange(origin: Origin) {
    setSavingOrigin(true);
    setOriginError(null);
    try {
      await setOrigin({ code: room.code, token, origin });
    } catch (error) {
      setOriginError(errorMessage(error, "출발지를 저장하지 못했어요."));
    } finally {
      setSavingOrigin(false);
    }
  }

  const readyToStart = room.origin !== null && room.players.length >= MIN_PLAYERS_TO_START;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">방 코드</p>
          <p className="font-mono text-3xl font-bold tracking-[0.2em]">{room.code}</p>
        </div>
        <ShareButton code={room.code} />
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">
          참여자 <span className="text-muted">{room.players.length}/{MAX_PLAYERS}</span>
        </h2>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${p.id === me.id || onlineIds.has(p.id) ? "bg-green-500" : "bg-line"}`}
                aria-label={p.id === me.id || onlineIds.has(p.id) ? "접속 중" : "접속 안 함"}
              />
              <span className="font-medium">{p.nickname}</span>
              {p.isHost && <span className="text-sm">👑</span>}
              {p.id === me.id && <span className="text-sm text-muted">(나)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">출발지</h2>
        {me.isHost ? (
          <OriginPicker value={room.origin} disabled={savingOrigin} onChange={handleOriginChange} />
        ) : (
          <p className={room.origin ? "font-medium" : "text-muted"}>
            {room.origin ? `🚩 ${room.origin.name}` : "방장이 출발지를 정하는 중이에요."}
          </p>
        )}
        <ErrorText>{originError}</ErrorText>
        <div className="h-72 overflow-hidden rounded-xl border border-line">
          <RegionMap origin={room.origin} />
        </div>
      </section>

      {me.isHost ? (
        <div className="flex flex-col gap-2">
          {/* 기준 라운드는 다음 개발 단계에서 연결한다. */}
          <Button disabled>{readyToStart ? "게임 시작 (다음 단계에서 열려요)" : "게임 시작"}</Button>
          {!readyToStart && (
            <p className="text-center text-sm text-muted">
              출발지를 정하고 친구가 {MIN_PLAYERS_TO_START}명 이상 모이면 시작할 수 있어요.
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-muted">방장이 게임을 시작하면 바로 넘어가요.</p>
      )}
    </main>
  );
}

function ShareButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/room/${code}`;
    const text = "어디로 갈까? 다트로 우리 여행지 정하자!";
    try {
      if (navigator.share) {
        await navigator.share({ title: "어디로 갈까?", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 공유 창을 닫은 경우 등은 무시
    }
  }

  return (
    <Button variant="secondary" onClick={handleShare} className="shrink-0">
      {copied ? "링크 복사됨!" : "친구 초대"}
    </Button>
  );
}
