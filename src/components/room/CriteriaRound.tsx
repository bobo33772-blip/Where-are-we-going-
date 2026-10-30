"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LazyRegionMap } from "@/components/map/LazyRegionMap";
import { Button, ErrorText } from "@/components/ui";
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

  // 동점이라 룰렛을 돌리는 동안에는 결과를 지도에 미리 반영하지 않는다. (결과 스포일러 방지)
  const [rouletteDoneFor, setRouletteDoneFor] = useState<string | null>(null);
  const rouletteRunning = current?.status === "revealed" && current.result?.tie === true && rouletteDoneFor !== current.id;
  const remaining = useRemaining(regions, room.origin, room.rounds, rouletteRunning && current ? current.id : null);

  const revealedCount = room.rounds.filter((r) => r.status === "revealed").length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">기준 정하기 · 정한 기준 {revealedCount}/{MAX_QUESTIONS}</p>
          <h1 className="text-xl font-bold">밸런스 게임</h1>
        </div>
        <p className="text-right text-sm">
          남은 곳
          <br />
          <span className="text-2xl font-bold text-accent">{remaining ? remaining.regions.length.toLocaleString() : "…"}</span>
          <span className="text-muted">곳</span>
        </p>
      </header>

      <div className="h-60 overflow-hidden rounded-2xl border border-line">
        <LazyRegionMap origin={room.origin} excludedCodes={remaining?.excluded ?? null} focusPoints={remaining?.focus ?? null} />
      </div>
      <ErrorText>{regionsError}</ErrorText>

      {current?.status === "open" && (
        <QuestionCard key={current.id} room={room} me={me} token={token} round={current} myChoice={myAnswers?.[current.id] ?? null} />
      )}
      {current?.status === "revealed" &&
        (rouletteRunning ? (
          <Roulette round={current} onDone={() => setRouletteDoneFor(current.id)} />
        ) : (
          <ResultCard room={room} me={me} token={token} round={current} />
        ))}
      {current?.status === "skipped" && <NoMoreQuestions room={room} me={me} token={token} />}

      <ChosenCriteria rounds={room.rounds} hideRoundId={rouletteRunning && current ? current.id : null} />
    </main>
  );
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roundId = round.id as Id<"rounds">;
  const answered = new Set<string>(round.answeredPlayerIds);

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
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="text-center text-lg font-bold">{round.title}</h2>

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
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-4 text-center transition-colors disabled:opacity-60 ${
                selected ? "border-accent bg-accent/10" : "border-line hover:border-accent"
              }`}
            >
              <span className="text-4xl" aria-hidden>
                {o.emoji}
              </span>
              <span className="font-bold">{o.label}</span>
              <span className="text-xs text-muted">{o.detail}</span>
              <span className="mt-1 text-xs font-semibold text-accent">→ {o.remaining.toLocaleString()}곳 남아요</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-center text-sm text-muted">
          {myChoice ? "골랐어요! 공개 전까지는 바꿀 수 있어요." : "둘 중 하나를 골라 주세요."} ({answered.size}/{room.players.length}명
          골랐어요)
        </p>
        <ul className="flex flex-wrap justify-center gap-1.5">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`rounded-full px-2.5 py-1 text-xs ${answered.has(p.id) ? "bg-accent text-white" : "bg-background text-muted"}`}
            >
              {answered.has(p.id) ? "✓ " : ""}
              {p.nickname}
            </li>
          ))}
        </ul>
      </div>

      <ErrorText>{error}</ErrorText>

      {me.isHost && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={busy || answered.size === 0}
            onClick={() => run(() => reveal({ code: room.code, token, roundId }), "공개하지 못했어요.")}
          >
            지금 공개하기
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => skip({ code: room.code, token, roundId }), "건너뛰지 못했어요.")}
          >
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = round.result!;
  const winner = round.options.find((o) => o.key === result.choice)!;
  const nickname = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? "나간 친구";

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
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <div className="text-center">
        <p className="text-sm text-muted">{round.title}</p>
        <p className="mt-1 text-2xl font-bold">
          {winner.emoji} {winner.label}!
        </p>
        <p className="text-sm text-muted">
          {result.tie ? `${result.votesA} 대 ${result.votesB} 동점이라 룰렛으로 정했어요` : `${result.votesA} 대 ${result.votesB}`}
          {" · "}
          {winner.remaining.toLocaleString()}곳이 남았어요
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {round.options.map((o) => {
          const voters = (round.votes ?? []).filter((v) => v.choice === o.key);
          return (
            <div
              key={o.key}
              className={`rounded-xl border-2 p-3 ${o.key === result.choice ? "border-accent" : "border-line opacity-70"}`}
            >
              <p className="text-sm font-semibold">
                {o.emoji} {o.label}
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {voters.length === 0 && <li className="text-xs text-muted">아무도 안 골랐어요</li>}
                {voters.map((v) => (
                  <li key={v.playerId} className="rounded-full bg-background px-2 py-0.5 text-xs">
                    {nickname(v.playerId)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <ErrorText>{error}</ErrorText>

      {me.isHost ? (
        <div className="flex flex-col gap-2">
          {round.canContinue ? (
            <>
              <Button
                disabled={busy}
                onClick={() => run(() => next({ code: room.code, token, roundId: round.id as Id<"rounds"> }), "다음 질문을 내지 못했어요.")}
              >
                다음 질문
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => finish({ code: room.code, token }), "넘어가지 못했어요.")}>
                여기까지 하고 다트 던지러 가기
              </Button>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted">
                {room.rounds.filter((r) => r.status === "revealed").length >= MAX_QUESTIONS
                  ? "질문을 다 했어요!"
                  : "더 좁힐 수 있는 질문이 없어요."}
              </p>
              <Button disabled={busy} onClick={() => run(() => finish({ code: room.code, token }), "넘어가지 못했어요.")}>
                🎯 다트 던지러 가기
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-muted">방장이 다음으로 넘기면 이어져요.</p>
      )}
    </section>
  );
}

function NoMoreQuestions({ room, me, token }: Props) {
  const finish = useMutation(api.game.finishCriteria);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 text-center">
      <p className="font-semibold">더 낼 수 있는 질문이 없어요.</p>
      <ErrorText>{error}</ErrorText>
      {me.isHost ? (
        <Button onClick={() => finish({ code: room.code, token }).catch((err) => setError(errorMessage(err, "넘어가지 못했어요.")))}>
          🎯 다트 던지러 가기
        </Button>
      ) : (
        <p className="text-sm text-muted">방장이 다트 라운드로 넘기면 이어져요.</p>
      )}
    </section>
  );
}
