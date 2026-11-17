"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import { ShareIcon } from "@/components/icons";
import { Button, ErrorText, MapFrame } from "@/components/ui";
import { drawResultCard } from "@/lib/card";
import { candidatesOf } from "@/lib/game/candidates";
import { distanceKm } from "@/lib/game/filters";
import { regionPlace, useRegionLookup } from "@/lib/game/useRegionLookup";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions } from "@/lib/regions";
import type { RoomState } from "@/lib/room/types";
import { ChosenCriteria } from "./ChosenCriteria";
import { Spinner } from "./Spinner";

// 최종 결과. 투표가 동점이었고 공개 순간을 이 화면에서 봤다면 룰렛부터 보여준다.
export function ResultView({ room, spin, onSpinDone }: { room: RoomState; spin: boolean; onSpinDone: () => void }) {
  const { regions, error: regionsError } = useRegions();
  const byCode = useRegionLookup(regions);
  const remaining = useRemaining(regions, room.origin, room.rounds);
  const result = room.result;
  const winner = result ? (byCode.get(result.regionCode) ?? null) : null;
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";

  if (!result) return null;

  // 동점이었던 후보들 (득표가 가장 많은 곳들)
  const counts = new Map<string, number>();
  for (const v of room.votes ?? []) counts.set(v.regionCode, (counts.get(v.regionCode) ?? 0) + 1);
  const tied = [...counts.entries()].filter(([, n]) => n === result.votes).map(([code]) => code);

  if (spin && result.tie && !regions) {
    return <p className="gutter py-12 text-muted">룰렛을 준비하는 중이에요…</p>;
  }
  if (spin && result.tie && regions) {
    return (
      <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 py-6">
        <div className="text-center">
          <p className="eyebrow">최종 투표</p>
          <h1 className="mt-1 font-display text-3xl leading-tight">{result.votes}표씩 동점, 룰렛으로 정해요</h1>
        </div>
        <Spinner
          items={tied.map((code) => {
            const r = byCode.get(code);
            return { key: code, label: r?.name ?? code, sub: r ? regionPlace(r) : undefined };
          })}
          resultKey={result.regionCode}
          onDone={onSpinDone}
        />
      </main>
    );
  }

  const distance = winner && room.origin ? Math.round(distanceKm(room.origin, winner)) : null;
  const criteria = room.rounds
    .filter((r) => r.status === "revealed" && r.result)
    .map((r) => r.options.find((o) => o.key === r.result!.choice)!.label);

  return (
    <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col gap-6 py-6">
      <header className="flex flex-col items-center text-center">
        <p className="eyebrow">우리의 다음 여행지</p>
        <h1 className="mt-2 font-display text-6xl leading-none">{winner?.name ?? "…"}</h1>
        {winner && <p className="mt-2 text-lg">{regionPlace(winner)}</p>}
        <p className="mt-2 text-sm text-muted">
          {result.unanimous
            ? "모두의 다트가 같은 곳에 꽂혔어요"
            : result.tie
              ? `${result.votes}표씩 동점이라 룰렛으로 정했어요`
              : `${result.votes}표로 정했어요`}
          {distance !== null && (
            <>
              {" · "}
              {room.origin!.name}에서 직선 <span className="font-semibold text-ink tabular-nums">{distance}km</span>
            </>
          )}
        </p>
      </header>

      <MapFrame className="h-72">
        <LazyRegionMap
          origin={room.origin}
          excludedCodes={remaining?.excluded ?? null}
          focusPoints={winner ? [winner] : null}
          pins={winner ? [{ id: "winner", lat: winner.lat, lng: winner.lng, label: winner.name, tone: "winner" }] : []}
          highlightCode={result.regionCode}
        />
      </MapFrame>
      <ErrorText>{regionsError}</ErrorText>

      {winner && remaining && (
        <ResultCard
          input={{
            regionName: winner.name,
            regionPlace: regionPlace(winner),
            winnerCode: winner.code,
            winnerPoint: winner,
            distanceText: distance !== null ? `${room.origin!.name}에서 직선 ${distance}km` : null,
            criteria,
            players: room.players.map((p) => p.nickname),
            excluded: remaining.excluded,
          }}
        />
      )}

      {!result.unanimous && (
        <section className="flex flex-col gap-2">
          <h2 className="text-center text-sm font-semibold">투표 결과</h2>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {candidatesOf(room).map((c) => {
              const r = byCode.get(c.regionCode);
              const voters = (room.votes ?? []).filter((v) => v.regionCode === c.regionCode).map((v) => nickname(v.playerId));
              const won = c.regionCode === result.regionCode;
              return (
                <li key={c.regionCode} className="flex min-h-11 items-baseline justify-between gap-3 py-2.5">
                  <span className={won ? "font-bold text-accent" : "font-medium"}>{r?.name ?? "…"}</span>
                  <span className="min-w-0 text-right text-muted">
                    <span className="font-semibold text-ink tabular-nums">{voters.length}표</span>
                    {voters.length > 0 && <span className="ml-2">{voters.join(", ")}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ChosenCriteria rounds={room.rounds} />

      <Link href="/" className="self-center text-sm text-muted underline underline-offset-4 hover:text-ink">
        새 게임 하기
      </Link>
    </main>
  );
}

function ResultCard({ input }: { input: Parameters<typeof drawResultCard>[0] }) {
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.url);
    };
  }, [image]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const blob = await drawResultCard(input);
      const file = new File([blob], `where-are-we-going-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      setImage({ url: URL.createObjectURL(blob), file });
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!image) return;
    try {
      await navigator.share({ files: [image.file], title: "야! 우리 어디가??", text: `우리의 다음 여행지는 ${input.regionName}!` });
    } catch {
      // 공유 창을 닫은 경우 등은 무시
    }
  }

  const canShareFile = image !== null && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [image.file] });

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5 shadow-sm">
      <div className="text-center">
        <h2 className="font-semibold">결과 카드</h2>
        <p className="text-sm text-muted">릴스·스토리 크기(9:16) 이미지로 만들어요.</p>
      </div>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 이미지(blob URL)라 next/image를 쓸 수 없다 */}
          <img src={image.url} alt={`결과 카드: ${input.regionName}`} className="mx-auto w-2/3 rounded-md border border-line" />
          <div className="flex gap-2">
            {canShareFile && (
              <Button className="flex-1" onClick={share}>
                <ShareIcon className="h-4 w-4" />
                공유하기
              </Button>
            )}
            <a
              href={image.url}
              download={image.file.name}
              className="flex h-12 flex-1 items-center justify-center rounded-md border border-line bg-surface font-semibold hover:border-ink"
            >
              이미지 저장
            </a>
          </div>
        </>
      ) : (
        <Button variant="accent" disabled={busy} onClick={create}>
          {busy ? "만드는 중…" : "결과 카드 만들기"}
        </Button>
      )}
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
