"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import type { MapPin } from "@/components/map/RegionMap";
import { CheckIcon } from "@/components/icons";
import { Button, Count, ErrorText, MapFrame, NameTag, ScreenHeader } from "@/components/ui";
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
    <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col gap-5 py-6">
      <ScreenHeader
        step={`최종 투표 · ${voted.size}/${room.players.length}명 투표함`}
        title="어디로 갈까?"
        aside={<Count label="후보" value={String(candidates.length)} unit="곳" />}
      />

      <MapFrame className="h-60">
        <LazyRegionMap
          origin={room.origin}
          excludedCodes={remaining?.excluded ?? null}
          focusPoints={focus.length > 0 ? focus : null}
          pins={pins}
        />
      </MapFrame>
      <ErrorText>{regionsError}</ErrorText>

      <section className="flex flex-col gap-3" aria-label="후보">
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
              className={`flex flex-col gap-1 rounded-md border-2 bg-surface p-4 text-left transition-colors disabled:opacity-60 ${
                selected ? "border-accent" : "border-line hover:border-ink"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-display text-2xl">{r ? r.name : "…"}</span>
                {selected && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
                    <CheckIcon className="h-4 w-4" />내 선택
                  </span>
                )}
              </span>
              {r && <span className="text-sm text-muted">{regionPlace(r)}</span>}
              <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{c.playerIds.map(nickname).join(", ")}의 다트</span>
                {r && room.origin && <span className="tabular-nums">직선 {Math.round(distanceKm(room.origin, r))}km</span>}
              </span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">
          {myVote ? "투표했어요. 결과가 나오기 전까지는 바꿀 수 있어요." : "가고 싶은 곳을 하나 골라 주세요."}
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="투표한 사람">
          {room.players.map((p) => (
            <NameTag key={p.id} name={p.nickname} done={voted.has(p.id)} />
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
