"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CrownIcon, FlagIcon, ShareIcon } from "@/components/icons";
import { Button, ErrorText, MapFrame } from "@/components/ui";
import { errorMessage } from "@/lib/room/client";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import { useOnlinePlayerIds } from "@/lib/room/hooks";
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from "@/lib/room/rules";
import type { Origin, PlayerView, RoomState } from "@/lib/room/types";
import { OriginPicker } from "./OriginPicker";

type Props = {
  room: RoomState;
  me: PlayerView;
  token: string;
};

export function Lobby({ room, me, token }: Props) {
  const setOrigin = useMutation(api.rooms.setOrigin);
  const startGame = useMutation(api.game.start);
  const transferHost = useMutation(api.rooms.transferHost);
  const [originError, setOriginError] = useState<string | null>(null);
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      await startGame({ code: room.code, token });
    } catch (error) {
      setStartError(errorMessage(error, "게임을 시작하지 못했어요."));
      setStarting(false);
    }
  }

  const readyToStart = room.origin !== null && room.players.length >= MIN_PLAYERS_TO_START;

  return (
    <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col gap-6 py-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="eyebrow">대기실 · 방 코드</p>
        <p className="font-mono text-4xl font-semibold tracking-[0.18em]">{room.code}</p>
        <ShareButton code={room.code} />
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline justify-between text-sm font-semibold">
          참여자
          <span className="tabular-nums text-muted">
            {room.players.length}/{MAX_PLAYERS}
          </span>
        </h2>
        <ul className="divide-y divide-line border-y border-line">
          {room.players.map((p) => {
            const online = p.id === me.id || onlineIds.has(p.id);
            return (
              <li key={p.id} className="flex min-h-12 items-center gap-3 py-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-accent" : "bg-line"}`}
                  aria-label={online ? "접속 중" : "접속 안 함"}
                />
                <span className="font-medium">{p.nickname}</span>
                {p.id === me.id && <span className="text-xs text-muted">나</span>}
                {p.isHost && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    <CrownIcon className="h-3.5 w-3.5" />
                    방장
                  </span>
                )}
                {me.isHost && p.id !== me.id && (
                  <button
                    type="button"
                    className="ml-auto rounded-md px-2 py-1 text-xs text-muted hover:text-ink"
                    onClick={() =>
                      transferHost({ code: room.code, token, playerId: p.id }).catch((error) =>
                        setStartError(errorMessage(error, "방장을 넘기지 못했어요.")),
                      )
                    }
                  >
                    방장 넘기기
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-center text-sm font-semibold">출발지</h2>
        {me.isHost ? (
          <OriginPicker value={room.origin} disabled={savingOrigin} onChange={handleOriginChange} />
        ) : (
          <p className={`flex items-center justify-center gap-2 ${room.origin ? "font-semibold" : "text-muted"}`}>
            {room.origin && <FlagIcon className="h-4 w-4 text-accent" />}
            {room.origin ? room.origin.name : "방장이 출발지를 정하는 중이에요."}
          </p>
        )}
        <ErrorText>{originError}</ErrorText>
        <MapFrame className="h-72">
          <LazyRegionMap origin={room.origin} />
        </MapFrame>
      </section>

      {me.isHost ? (
        <div className="flex flex-col gap-2">
          <Button disabled={!readyToStart || starting} onClick={handleStart}>
            {starting ? "시작하는 중…" : "게임 시작"}
          </Button>
          <ErrorText>{startError}</ErrorText>
          {!readyToStart && (
            <p className="text-center text-sm text-muted">출발지를 정하고 친구가 {MIN_PLAYERS_TO_START}명 이상 모이면 시작할 수 있어요.</p>
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
    const text = "야! 우리 어디가?? 다트로 우리 여행지 정하자!";
    try {
      if (navigator.share) {
        await navigator.share({ title: "야! 우리 어디가??", text, url });
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
      <ShareIcon className="h-4 w-4" />
      {copied ? "링크 복사됨" : "친구 초대"}
    </Button>
  );
}
