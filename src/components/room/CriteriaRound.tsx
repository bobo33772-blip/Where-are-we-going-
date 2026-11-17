"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import { ArrowRightIcon, CheckIcon, DartIcon } from "@/components/icons";
import { Button, Count, ErrorText, MapFrame, NameTag, ScreenHeader } from "@/components/ui";
import { MAX_QUESTIONS, type OptionKey } from "@/lib/game/questions";
import { useRemaining } from "@/lib/game/useRemaining";
import { useRegions } from "@/lib/regions";
import { errorMessage } from "@/lib/room/client";
import type { PlayerView, RoomState, RoundView } from "@/lib/room/types";
import { ChosenCriteria } from "./ChosenCriteria";
import { Roulette } from "./Roulette";

type Props = { room: RoomState; me: PlayerView; token: string };

// 기준 라운드: 밸런스 게임으로 기준을 정하고, 정해질 때마다 지도가 줄어든다.
export function CriteriaRound({ room, me, token }: Props) {
  const { regions, error: regionsError } = useRegions();
  const myAnswers = useQuery(api.game.myAnswers, { code: room.code, token });
  const current = room.rounds.find((r) => r.id === room.currentRoundId) ?? null;

  // 동점 룰렛은 이 화면에서 공개 순간(질문이 열림 → 공개됨)을 직접 본 경우에만 돌린다.
  // 새로고침하거나 늦게 들어와서 이미 공개된 결과를 볼 때는 룰렛 없이 결과를 바로 보여준다.
  // (렌더링 중에 이전 상태와 비교해 갱신하는 React 권장 방식)
  const [seen, setSeen] = useState<{ id: string; status: RoundView["status"] } | null>(null);
  const [rouletteFor, setRouletteFor] = useState<string | null>(null);
  if (current && (seen?.id !== current.id || seen.status !== current.status)) {
    if (seen?.id === current.id && seen.status === "open" && current.status === "revealed" && current.result?.tie) {
      setRouletteFor(current.id);
    }
    setSeen({ id: current.id, status: current.status });
  }
  // 룰렛이 도는 동안에는 결과를 지도에 미리 반영하지 않는다. (결과 스포일러 방지)
  const rouletteRunning = current?.status === "revealed" && rouletteFor === current.id;
  const remaining = useRemaining(regions, room.origin, room.rounds, rouletteRunning && current ? current.id : null);

  const revealedCount = room.rounds.filter((r) => r.status === "revealed").length;

  return (
    <main className="gutter mx-auto flex w-full max-w-md flex-1 flex-col gap-5 py-6">
      <ScreenHeader
        step={`기준 정하기 · ${revealedCount}/${MAX_QUESTIONS}`}
        title="밸런스 게임"
        aside={<Count label="남은 곳" value={remaining ? remaining.regions.length.toLocaleString() : "…"} unit="곳" />}
      />

      <MapFrame className="h-60">
        <LazyRegionMap origin={room.origin} excludedCodes={remaining?.excluded ?? null} focusPoints={remaining?.focus ?? null} />
      </MapFrame>
      <ErrorText>{regionsError}</ErrorText>

      {current?.status === "open" && (
        <QuestionCard key={current.id} room={room} me={me} token={token} round={current} myChoice={myAnswers?.[current.id] ?? null} />
      )}
      {current?.status === "revealed" &&
        (rouletteRunning ? (
          <Roulette round={current} onDone={() => setRouletteFor(null)} />
        ) : (
          <ResultCard room={room} me={me} token={token} round={current} />
        ))}
      {current?.status === "skipped" && <NoMoreQuestions room={room} me={me} token={token} />}

      <ChosenCriteria rounds={room.rounds} hideRoundId={rouletteRunning && current ? current.id : null} />
    </main>
  );
}

function useRun() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  return { error, busy, run };
}

function QuestionCard({
  room,
  me,
  token,
  round,
  myChoice,
}: Props & { round: RoundView; myChoice: OptionKey | null }) {
  const answer = useMutation(api.game.answer);
  const reveal = useMutation(api.game.reveal);
  const skip = useMutation(api.game.skip);
  const { error, busy, run } = useRun();

  const roundId = round.id as Id<"rounds">;
  const answered = new Set<string>(round.answeredPlayerIds);

  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-display text-2xl leading-snug">{round.title}</h2>

      {/* A와 B는 실제 두 선택지라 글자로 구분한다 */}
      <div className="grid grid-cols-2 gap-3">
        {round.options.map((o) => {
          const selected = myChoice === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={busy}
              aria-pressed={selected}
              onClick={() => run(() => answer({ code: room.code, token, roundId, choice: o.key }), "선택하지 못했어요.")}
              className={`flex min-w-0 flex-col gap-2 rounded-md border-2 p-4 text-left transition-colors disabled:opacity-60 ${
                selected ? "border-accent bg-accent-soft" : "border-line hover:border-ink"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`font-mono text-sm font-semibold ${selected ? "text-accent" : "text-muted"}`}>{o.key}</span>
                {selected && <CheckIcon className="h-4 w-4 text-accent" />}
              </span>
              <span className="text-lg font-bold leading-snug">{o.label}</span>
              <span className="text-xs text-muted">{o.detail}</span>
              <span className="mt-auto border-t border-line pt-2 text-xs text-muted">
                남는 곳 <span className="font-semibold text-ink tabular-nums">{o.remaining.toLocaleString()}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {myChoice ? "골랐어요. 결과가 나오기 전까지는 바꿀 수 있어요." : "둘 중 하나를 골라 주세요."}
          <span className="ml-1 font-semibold tabular-nums">
            {answered.size}/{room.players.length}
          </span>
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="고른 사람">
          {room.players.map((p) => (
            <NameTag key={p.id} name={p.nickname} done={answered.has(p.id)} />
          ))}
        </ul>
      </div>

      <ErrorText>{error}</ErrorText>

      {me.isHost && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy || answered.size === 0}
            onClick={() => run(() => reveal({ code: room.code, token, roundId }), "공개하지 못했어요.")}
          >
            지금 공개하기
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => skip({ code: room.code, token, roundId }), "건너뛰지 못했어요.")}>
            건너뛰기
          </Button>
        </div>
      )}
    </section>
  );
}

function ResultCard({ room, me, token, round }: Props & { round: RoundView }) {
  const next = useMutation(api.game.next);
  const finish = useMutation(api.game.finishCriteria);
  const { error, busy, run } = useRun();

  const result = round.result!;
  const winner = round.options.find((o) => o.key === result.choice)!;
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";
  const revealedCount = room.rounds.filter((r) => r.status === "revealed").length;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-surface p-5 shadow-sm">
      <div>
        <p className="eyebrow">{round.title}</p>
        <p className="mt-1 font-display text-3xl leading-tight">{winner.label}</p>
        <p className="mt-1 text-sm text-muted">
          {result.tie ? `${result.votesA} 대 ${result.votesB} 동점이라 룰렛으로 정했어요` : `${result.votesA} 대 ${result.votesB}`}
          {" · "}
          <span className="font-semibold text-ink tabular-nums">{winner.remaining.toLocaleString()}</span>곳이 남았어요
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {round.options.map((o) => {
          const voters = (round.votes ?? []).filter((v) => v.choice === o.key);
          const won = o.key === result.choice;
          return (
            <div key={o.key} className={`flex min-w-0 flex-col gap-2 rounded-md border-2 p-3 ${won ? "border-accent" : "border-line opacity-60"}`}>
              <p className="flex items-baseline gap-2 text-sm font-semibold">
                <span className={`font-mono ${won ? "text-accent" : "text-muted"}`}>{o.key}</span>
                {o.label}
              </p>
              <ul className="flex flex-wrap gap-1">
                {voters.length === 0 && <li className="text-xs text-muted">아무도 안 골랐어요</li>}
                {voters.map((v) => (
                  <NameTag key={v.playerId} name={nickname(v.playerId)} done={won} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <ErrorText>{error}</ErrorText>

      {me.isHost ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {round.canContinue ? (
            <>
              <Button
                disabled={busy}
                onClick={() => run(() => next({ code: room.code, token, roundId: round.id as Id<"rounds"> }), "다음 질문을 내지 못했어요.")}
              >
                다음 질문
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => run(() => finish({ code: room.code, token }), "넘어가지 못했어요.")}>
                여기까지 하고 다트 던지러 가기
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{revealedCount >= MAX_QUESTIONS ? "질문을 다 했어요." : "더 좁힐 수 있는 질문이 없어요."}</p>
              <Button variant="accent" disabled={busy} onClick={() => run(() => finish({ code: room.code, token }), "넘어가지 못했어요.")}>
                <DartIcon className="h-5 w-5" />
                다트 던지러 가기
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-sm text-muted">방장이 다음으로 넘기면 이어져요.</p>
      )}
    </section>
  );
}

function NoMoreQuestions({ room, me, token }: Props) {
  const finish = useMutation(api.game.finishCriteria);
  const { error, busy, run } = useRun();

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5 shadow-sm">
      <p className="font-semibold">더 낼 수 있는 질문이 없어요.</p>
      <ErrorText>{error}</ErrorText>
      {me.isHost ? (
        <Button variant="accent" disabled={busy} onClick={() => run(() => finish({ code: room.code, token }), "넘어가지 못했어요.")}>
          <DartIcon className="h-5 w-5" />
          다트 던지러 가기
        </Button>
      ) : (
        <p className="text-sm text-muted">방장이 다트 라운드로 넘기면 이어져요.</p>
      )}
    </section>
  );
}
