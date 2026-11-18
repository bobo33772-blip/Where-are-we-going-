"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import type { FlyTarget, MapPin } from "@/components/map/RegionMap";
import { ArrowRightIcon, SoundIcon } from "@/components/icons";
import { Button, Count, ErrorText, MapFrame, ScreenHeader } from "@/components/ui";
import { MAX_ATTEMPTS } from "@/lib/game/darts";
import { regionPlace, useRegionLookup } from "@/lib/game/useRegionLookup";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions, type Region } from "@/lib/regions";
import { errorMessage } from "@/lib/room/client";
import type { PlayerView, RoomState } from "@/lib/room/types";
import { playImpact, playWhoosh, setMuted, unlockAudio, useMuted } from "@/lib/sfx";
import { ChosenCriteria } from "./ChosenCriteria";
import { DartFlight } from "./DartFlight";
import { DartGraphic } from "./DartGraphic";
import { ThrowPad } from "./ThrowPad";

type Props = { room: RoomState; me: PlayerView; token: string };
type ThrowView = RoomState["throws"][number];

// 세게 던질수록 빨리 날아간다. (1.0~1.5초) 세기가 없는 다트(방장이 대신 던짐, 버튼)는 중간 세기로 본다.
const DEFAULT_POWER = 0.5;
const flightMs = (power: number | null) => Math.round(1500 - (power ?? DEFAULT_POWER) * 500);
// 꽂힌 뒤 흔들림·물결이 끝날 때까지
const IMPACT_MS = 750;

const isFinal = (t: ThrowView) => t.outcome === "hit" || t.outcome === "snapped";

// 다트 라운드: 차례대로 한 명씩, 남은 땅에 다트를 던진다.
export function DartsRound({ room, me, token }: Props) {
  const { regions, error: regionsError } = useRegions();
  const byCode = useRegionLookup(regions);
  const remaining = useRemaining(regions, room.origin, room.rounds);
  const throwDart = useMutation(api.darts.throwDart);
  const startVote = useMutation(api.darts.startVote);
  const muted = useMuted();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => [...room.players].sort((a, b) => a.turnOrder - b.turnOrder), [room.players]);
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";

  // 새 다트가 들어오면 모두의 화면에서 날아가는 연출(flying) → 꽂히는 연출(impact) 순서로 보여준다.
  // 날아가는 동안에는 결과를 숨긴다. 처음 화면을 열 때 이미 있던 다트는 연출 없이 바로 보여준다.
  const latest = room.throws.at(-1) ?? null;
  const [seenLatestId, setSeenLatestId] = useState<string | null | undefined>(undefined);
  const [anim, setAnim] = useState<{ id: string; stage: "flying" | "impact" } | null>(null);
  if (seenLatestId === undefined) {
    setSeenLatestId(latest?.id ?? null);
  } else if (latest && latest.id !== seenLatestId) {
    setSeenLatestId(latest.id);
    setAnim({ id: latest.id, stage: "flying" });
  }
  const animThrow = anim ? (room.throws.find((t) => t.id === anim.id) ?? null) : null;
  const active = anim && animThrow ? { ...anim, throw: animThrow } : null;

  // 방 상태가 바뀔 때마다 다트 객체가 새로 만들어지므로, 값으로 비교해서 연출이 처음부터 다시 돌지 않게 한다.
  const activeId = active?.id ?? null;
  const activeStage = active?.stage ?? null;
  const activePower = active?.throw.power ?? null;
  const activeOutcome = active?.throw.outcome ?? null;
  useEffect(() => {
    if (!activeId || !activeOutcome) return;
    if (activeStage === "flying") {
      const ms = flightMs(activePower);
      playWhoosh(ms, activePower ?? DEFAULT_POWER);
      const timer = setTimeout(() => setAnim({ id: activeId, stage: "impact" }), ms);
      return () => clearTimeout(timer);
    }
    playImpact(activeOutcome);
    const timer = setTimeout(() => setAnim(null), IMPACT_MS);
    return () => clearTimeout(timer);
  }, [activeId, activeStage, activePower, activeOutcome]);

  // 날아가는 중인 다트는 결과가 드러나지 않게 차례·후보 계산에서도 뺀다.
  const hiddenId = activeStage === "flying" ? activeId : null;
  const visibleThrows = room.throws.filter((t) => t.id !== hiddenId);
  const finals = new Map(visibleThrows.filter(isFinal).map((t) => [t.playerId, t]));
  const thrower = players.find((p) => !finals.has(p.id)) ?? null;
  const attemptsUsed = thrower ? visibleThrows.filter((t) => t.playerId === thrower.id).length : 0;
  const throwArgs = thrower ? { code: room.code, token, expectedPlayerId: thrower.id, expectedAttempt: attemptsUsed + 1 } : null;
  const pins: MapPin[] = visibleThrows.map((t) => ({
    id: t.id,
    lat: t.lat,
    lng: t.lng,
    label: isFinal(t) ? nickname(t.playerId) : t.outcome === "sea" ? "바다" : "기준 밖",
    tone: isFinal(t) ? "hit" : "miss",
  }));
  // 다트가 날아가는 동안 지도도 같은 시간에 걸쳐 꽂힐 자리로 움직인다.
  const flyTo: FlyTarget | null = latest ? { id: latest.id, lat: latest.lat, lng: latest.lng, durationMs: flightMs(latest.power) } : null;
  const animating = active !== null;
  const shaking = activeStage === "impact" && (activeOutcome === "hit" || activeOutcome === "snapped");
  const myTurn = thrower?.id === me.id;
  // 지도 틀 안, 던지는 자리를 붙일 곳
  const [laneSlot, setLaneSlot] = useState<HTMLDivElement | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col gap-5 py-6">
      <ScreenHeader
        step={`다트 던지기 · ${finals.size}/${players.length}명 던짐`}
        title="다트 라운드"
        aside={<Count label="남은 곳" value={remaining ? remaining.regions.length.toLocaleString() : "…"} unit="곳" />}
      />

      <div
        className={shaking ? "map-shake" : ""}
        style={{ "--shake": `${2 + (activePower ?? DEFAULT_POWER) * 3}px` } as CSSProperties}
      >
        <MapFrame className="h-72">
          <LazyRegionMap
            origin={room.origin}
            excludedCodes={remaining?.excluded ?? null}
            focusPoints={remaining?.focus ?? null}
            pins={pins}
            flyTo={flyTo}
          />
          {myTurn && <div ref={setLaneSlot} className="absolute inset-x-0 bottom-0 z-[5] h-36" />}
          {active && (
            <DartFlight
              key={active.id}
              stage={active.stage}
              outcome={active.throw.outcome}
              flightMs={flightMs(active.throw.power)}
              power={active.throw.power ?? DEFAULT_POWER}
            />
          )}
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setMuted(!muted);
            }}
            aria-pressed={!muted}
            className="absolute left-2 top-2 z-20 inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface/90 px-3 text-xs font-semibold text-ink shadow-sm"
          >
            <SoundIcon muted={muted} className="h-4 w-4" />
            {muted ? "소리 꺼짐" : "소리 켜짐"}
          </button>
        </MapFrame>
      </div>
      <ErrorText>{regionsError}</ErrorText>

      {latest && (
        <LatestThrow
          key={latest.id}
          throw={latest}
          flying={hiddenId === latest.id}
          nickname={nickname(latest.playerId)}
          region={latest.regionCode ? (byCode.get(latest.regionCode) ?? null) : null}
        />
      )}

      {/* 지금 해야 할 동작. 이 화면에서 유일하게 카드로 띄운다 */}
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5 shadow-sm">
        {thrower ? (
          <>
            <p className="flex flex-col items-center gap-0.5 text-center">
              <span className="font-semibold">{myTurn ? "내 차례예요" : `${thrower.nickname}님 차례예요`}</span>
              <span className="text-sm tabular-nums text-muted">
                기회 {attemptsUsed + 1}/{MAX_ATTEMPTS}
              </span>
            </p>
            {myTurn ? (
              <ThrowPad
                laneSlot={laneSlot}
                disabled={busy || animating}
                flying={activeStage === "flying"}
                resetKey={`${thrower.id}:${attemptsUsed}`}
                onThrow={(power) => run(() => throwDart({ ...throwArgs!, power }), "던지지 못했어요.")}
              />
            ) : me.isHost ? (
              <Button
                variant="secondary"
                disabled={busy || animating}
                onClick={() => run(() => throwDart(throwArgs!), "던지지 못했어요.")}
              >
                자리를 비웠다면 대신 던지기
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">{thrower.nickname}님이 던지길 기다리는 중이에요.</p>
            )}
          </>
        ) : (
          <>
            <p className="text-center font-semibold">모두 던졌어요. 이제 투표로 정해요.</p>
            {me.isHost ? (
              <Button disabled={busy || animating} onClick={() => run(() => startVote({ code: room.code, token }), "투표를 시작하지 못했어요.")}>
                투표하러 가기
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">방장이 투표를 시작하면 이어져요.</p>
            )}
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-center text-sm font-semibold">후보</h2>
        <ul className="divide-y divide-line border-y border-line">
          {players.map((p) => {
            const t = finals.get(p.id);
            const region = t?.regionCode ? byCode.get(t.regionCode) : undefined;
            return (
              <li key={p.id} className="flex min-h-12 items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="shrink-0 font-medium">{p.nickname}</span>
                <span className={`min-w-0 text-right ${region ? "" : "text-muted"}`}>
                  {region ? (
                    <>
                      <span className="font-semibold">{region.name}</span>{" "}
                      <span className="text-muted">{regionPlace(region)}</span>
                      {t?.byHost && <span className="block text-xs text-muted">방장이 대신 던짐</span>}
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
      <div className="flex flex-col items-center gap-2 border-t-2 border-accent pt-3 text-center" aria-live="polite">
        <DartGraphic className="block h-8 w-[11px] animate-pulse" />
        <p className="font-semibold">{nickname}님의 다트가 날아가는 중…</p>
      </div>
    );
  }

  const left = MAX_ATTEMPTS - t.attempt;
  const message =
    t.outcome === "hit"
      ? `${nickname}님의 다트가 꽂혔어요`
      : t.outcome === "snapped"
        ? `${MAX_ATTEMPTS}번 다 빗나가서 가장 가까운 남은 땅으로 옮겼어요`
        : t.outcome === "sea"
          ? `바다에 빠졌어요. 기회가 ${left}번 남았어요`
          : `우리 기준 밖의 땅이에요. 기회가 ${left}번 남았어요`;
  const missed = t.outcome === "sea" || t.outcome === "outside";

  return (
    <div className={`border-t-2 pt-3 text-center ${missed ? "border-line" : "border-accent"}`} aria-live="polite">
      <p className={`text-sm ${missed ? "text-muted" : "font-semibold"}`}>{message}</p>
      {region && (
        <p className="mt-1 flex flex-col items-center">
          <span className="font-display text-3xl">{region.name}</span>
          <span className="text-sm text-muted">{regionPlace(region)}</span>
        </p>
      )}
    </div>
  );
}
