"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import type { MapPin } from "@/components/map/RegionMap";
import { Button, ErrorText } from "@/components/ui";
import { candidatesOf } from "@/lib/game/candidates";
import { distanceKm } from "@/lib/game/filters";
import { regionPlace, useRegionLookup } from "@/lib/game/useRegionLookup";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions } from "@/lib/regions";
import { errorMessage } from "@/lib/room/client";
import type { PlayerView, RoomState } from "@/lib/room/types";

type Props = { room: RoomState; me: PlayerView; token: string };

// 최종 투표: 다트로 정해진 후보 중 한 곳에 투표한다. 결과 공개 전까지는 바꿀 수 있다.
export function VoteRound({ room, me, token }: Props) {
  const { regions, error: regionsError } = useRegions();
  const byCode = useRegionLookup(regions);
  const remaining = useRemaining(regions, room.origin, room.rounds);
  const myVote = useQuery(api.darts.myVote, { code: room.code, token });
  const castVote = useMutation(api.darts.castVote);
  const revealVotes = useMutation(api.darts.revealVotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = candidatesOf(room);
  const voted = new Set<string>(room.votedPlayerIds);
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";

  const pins: MapPin[] = candidates.flatMap((c) => {
    const r = byCode.get(c.regionCode);
    return r ? [{ id: c.regionCode, lat: r.lat, lng: r.lng, label: `${r.name}`, tone: c.regionCode === myVote ? "winner" : "hit" } as MapPin] : [];
  });
  const focus = candidates.flatMap((c) => {
    const r = byCode.get(c.regionCode);
    return r ? [r] : [];
  });

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

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <header>
        <p className="text-sm text-muted">최종 투표 · {voted.size}/{room.players.length}명 투표함</p>
        <h1 className="text-xl font-bold">🗳️ 어디로 갈까?</h1>
      </header>

      <div className="h-60 overflow-hidden rounded-2xl border border-line">
        <LazyRegionMap
          origin={room.origin}
          excludedCodes={remaining?.excluded ?? null}
          focusPoints={focus.length > 0 ? focus : null}
          pins={pins}
        />
      </div>
      <ErrorText>{regionsError}</ErrorText>

      <section className="flex flex-col gap-3">
        {candidates.map((c) => {
          const r = byCode.get(c.regionCode);
          const selected = myVote === c.regionCode;
          return (
            <button
              key={c.regionCode}
              type="button"
              disabled={busy}
              aria-pressed={selected}
              onClick={() => run(() => castVote({ code: room.code, token, regionCode: c.regionCode }), "투표하지 못했어요.")}
              className={`flex flex-col gap-1 rounded-2xl border-2 bg-card p-4 text-left transition-colors disabled:opacity-60 ${
                selected ? "border-accent" : "border-line hover:border-accent"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold">{r ? r.name : "…"}</span>
                {selected && <span className="text-sm font-semibold text-accent">✓ 내 선택</span>}
              </span>
              {r && <span className="text-sm text-muted">{regionPlace(r)}</span>}
              <span className="text-xs text-muted">
                🎯 {c.playerIds.map(nickname).join(", ")}의 다트
                {r && room.origin && ` · 출발지에서 직선 ${Math.round(distanceKm(room.origin, r))}km`}
              </span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <p className="text-center text-sm text-muted">
          {myVote ? "투표했어요! 결과가 나오기 전까지는 바꿀 수 있어요." : "가고 싶은 곳을 하나 골라 주세요."}
        </p>
        <ul className="flex flex-wrap justify-center gap-1.5">
          {room.players.map((p) => (
            <li key={p.id} className={`rounded-full px-2.5 py-1 text-xs ${voted.has(p.id) ? "bg-accent text-white" : "bg-background text-muted"}`}>
              {voted.has(p.id) ? "✓ " : ""}
              {p.nickname}
            </li>
          ))}
        </ul>
        <ErrorText>{error}</ErrorText>
        {me.isHost && (
          <Button
            variant="secondary"
            disabled={busy || voted.size === 0}
            onClick={() => run(() => revealVotes({ code: room.code, token }), "결과를 공개하지 못했어요.")}
          >
            지금 결과 공개하기
          </Button>
        )}
      </section>
    </main>
  );
}
