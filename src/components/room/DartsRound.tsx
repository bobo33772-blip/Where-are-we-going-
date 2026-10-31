"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import type { MapPin } from "@/components/map/RegionMap";
import { Button, ErrorText } from "@/components/ui";
import { MAX_ATTEMPTS } from "@/lib/game/darts";
import { regionPlace, useRegionLookup } from "@/lib/game/useRegionLookup";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions, type Region } from "@/lib/regions";
import { errorMessage } from "@/lib/room/client";
import type { PlayerView, RoomState } from "@/lib/room/types";
import { ChosenCriteria } from "./ChosenCriteria";

type Props = { room: RoomState; me: PlayerView; token: string };
type ThrowView = RoomState["throws"][number];

// 다트가 날아가는 동안 결과를 잠깐 숨겨서 긴장감을 준다.
const FLIGHT_MS = 1300;

const isFinal = (t: ThrowView) => t.outcome === "hit" || t.outcome === "snapped";

// 다트 라운드: 차례대로 한 명씩, 남은 땅에 다트를 던진다.
export function DartsRound({ room, me, token }: Props) {
  const { regions, error: regionsError } = useRegions();
  const byCode = useRegionLookup(regions);
  const remaining = useRemaining(regions, room.origin, room.rounds);
  const throwDart = useMutation(api.darts.throwDart);
  const startVote = useMutation(api.darts.startVote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => [...room.players].sort((a, b) => a.turnOrder - b.turnOrder), [room.players]);
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";

  // 새 다트가 들어오면 잠깐 "날아가는 중"을 보여준 뒤 결과를 공개한다. 처음 화면을 열 때 이미 있던 다트는 바로 보여준다.
  const latest = room.throws.at(-1) ?? null;
  const [seenLatestId, setSeenLatestId] = useState<string | null | undefined>(undefined);
  const [flyingId, setFlyingId] = useState<string | null>(null);
  if (seenLatestId === undefined) {
    setSeenLatestId(latest?.id ?? null);
  } else if (latest && latest.id !== seenLatestId) {
    setSeenLatestId(latest.id);
    setFlyingId(latest.id);
  }
  useEffect(() => {
    if (!flyingId) return;
    const timer = setTimeout(() => setFlyingId(null), FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [flyingId]);

  // 날아가는 중인 다트는 결과가 드러나지 않게 차례·후보 계산에서도 뺀다.
  const visibleThrows = room.throws.filter((t) => t.id !== flyingId);
  const finals = new Map(visibleThrows.filter(isFinal).map((t) => [t.playerId, t]));
  const thrower = players.find((p) => !finals.has(p.id)) ?? null;
  const attemptsUsed = thrower ? visibleThrows.filter((t) => t.playerId === thrower.id).length : 0;
  const throwArgs = thrower ? { code: room.code, token, expectedPlayerId: thrower.id, expectedAttempt: attemptsUsed + 1 } : null;
  const pins: MapPin[] = visibleThrows.map((t) => ({
    id: t.id,
    lat: t.lat,
    lng: t.lng,
    label: isFinal(t) ? `🎯 ${nickname(t.playerId)}` : t.outcome === "sea" ? "💦" : "🚫",
    tone: isFinal(t) ? "hit" : "miss",
  }));
  const latestPin = latest ? (pins.find((p) => p.id === latest.id) ?? null) : null;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const myTurn = thrower?.id === me.id;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            다트 던지기 · {finals.size}/{players.length}명 던짐
          </p>
          <h1 className="text-xl font-bold">🎯 다트 라운드</h1>
        </div>
        <p className="text-right text-sm">
          남은 곳
          <br />
          <span className="text-2xl font-bold text-accent">{remaining ? remaining.regions.length.toLocaleString() : "…"}</span>
          <span className="text-muted">곳</span>
        </p>
      </header>

      <div className="h-72 overflow-hidden rounded-2xl border border-line">
        <LazyRegionMap
          origin={room.origin}
          excludedCodes={remaining?.excluded ?? null}
          focusPoints={remaining?.focus ?? null}
          pins={pins}
          flyToPin={latestPin}
        />
      </div>
      <ErrorText>{regionsError}</ErrorText>

      {latest && (
        <LatestThrow
          key={latest.id}
          throw={latest}
          flying={flyingId === latest.id}
          nickname={nickname(latest.playerId)}
          region={latest.regionCode ? (byCode.get(latest.regionCode) ?? null) : null}
        />
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        {thrower ? (
          <>
            <p className="text-center font-semibold">
              {myTurn ? "내 차례예요!" : `${thrower.nickname}님 차례예요`}
              <span className="ml-1 text-sm font-normal text-muted">
                ({attemptsUsed + 1}/{MAX_ATTEMPTS}번째 기회)
              </span>
            </p>
            {myTurn ? (
              <Button disabled={busy || flyingId !== null} onClick={() => run(() => throwDart(throwArgs!), "던지지 못했어요.")}>
                🎯 다트 던지기
              </Button>
            ) : me.isHost ? (
              <Button
                variant="secondary"
                disabled={busy || flyingId !== null}
                onClick={() => run(() => throwDart(throwArgs!), "던지지 못했어요.")}
              >
                자리를 비웠다면 대신 던지기
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">{thrower.nickname}님이 던지길 기다리는 중…</p>
            )}
          </>
        ) : (
          <>
            <p className="text-center font-semibold">모두 던졌어요! 이제 투표로 정해요.</p>
            {me.isHost ? (
              <Button disabled={busy || flyingId !== null} onClick={() => run(() => startVote({ code: room.code, token }), "투표를 시작하지 못했어요.")}>
                🗳️ 투표하러 가기
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">방장이 투표를 시작하면 이어져요.</p>
            )}
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">후보</h2>
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const t = finals.get(p.id);
            const region = t?.regionCode ? byCode.get(t.regionCode) : undefined;
            return (
              <li key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{p.nickname}</span>
                <span className={region ? "text-right" : "text-muted"}>
                  {region ? (
                    <>
                      <span className="font-semibold">{region.name}</span>{" "}
                      <span className="text-muted">{regionPlace(region)}</span>
                      {t?.byHost && <span className="text-muted"> (대신 던짐)</span>}
                    </>
                  ) : p.id === thrower?.id ? (
                    "던지는 중"
                  ) : (
                    "대기"
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <ChosenCriteria rounds={room.rounds} />
    </main>
  );
}

function LatestThrow({
  throw: t,
  flying,
  nickname,
  region,
}: {
  throw: ThrowView;
  flying: boolean;
  nickname: string;
  region: Region | null;
}) {
  if (flying) {
    return (
      <p className="animate-pulse rounded-2xl bg-card p-4 text-center text-lg font-bold" aria-live="polite">
        {nickname}님의 다트가 날아가는 중… 🎯💨
      </p>
    );
  }

  const left = MAX_ATTEMPTS - t.attempt;
  const message =
    t.outcome === "hit"
      ? `🎯 ${nickname}님의 다트가 꽂혔어요!`
      : t.outcome === "snapped"
        ? `${MAX_ATTEMPTS}번 다 빗나가서 가장 가까운 남은 땅으로 옮겼어요`
        : t.outcome === "sea"
          ? `💦 풍덩! 바다에 빠졌어요. 기회 ${left}번 남았어요`
          : `🚫 우리 기준 밖의 땅이에요. 기회 ${left}번 남았어요`;

  return (
    <div className="rounded-2xl bg-card p-4 text-center" aria-live="polite">
      <p className="font-semibold">{message}</p>
      {region && (
        <p className="mt-1 text-2xl font-bold">
          {region.name} <span className="text-base font-normal text-muted">{regionPlace(region)}</span>
        </p>
      )}
    </div>
  );
}
