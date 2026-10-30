"use client";

import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import { ErrorText } from "@/components/ui";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions } from "@/lib/regions";
import type { RoomState } from "@/lib/room/types";
import { ChosenCriteria } from "./ChosenCriteria";

// 기준 라운드가 끝난 뒤의 화면. 다트 라운드는 다음 개발 단계에서 이 자리에 들어간다.
export function DartsWaiting({ room }: { room: RoomState }) {
  const { regions, error } = useRegions();
  const remaining = useRemaining(regions, room.origin, room.rounds);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <header className="text-center">
        <p className="text-5xl" aria-hidden>
          🎯
        </p>
        <h1 className="mt-2 text-2xl font-bold">다트 던질 땅이 정해졌어요!</h1>
        <p className="text-muted">
          전국 3,559곳 중{" "}
          <span className="font-bold text-accent">{remaining ? remaining.regions.length.toLocaleString() : "…"}곳</span>이 남았어요
        </p>
      </header>

      <div className="h-72 overflow-hidden rounded-2xl border border-line">
        <LazyRegionMap origin={room.origin} excludedCodes={remaining?.excluded ?? null} focusPoints={remaining?.focus ?? null} />
      </div>
      <ErrorText>{error}</ErrorText>

      <ChosenCriteria rounds={room.rounds} />

      <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">
        다트 던지기는 다음 업데이트에서 열려요.
      </p>
    </main>
  );
}
