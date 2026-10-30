"use client";

import { useEffect, useRef, useState } from "react";
import type { OptionKey } from "@/lib/game/questions";
import type { RoundView } from "@/lib/room/types";

// 점점 느려지며 두 선택지를 번갈아 비추다가 결과에서 멈춘다. (결과는 서버가 이미 정했다)
const STEPS_MS = [80, 80, 90, 100, 110, 130, 150, 180, 220, 270, 330, 400, 480];
const HOLD_MS = 1200;

export function Roulette({ round, onDone }: { round: RoundView; onDone: () => void }) {
  const result = round.result!.choice;
  // 마지막 칸이 결과가 되도록 시작 칸을 정한다.
  const start: OptionKey = STEPS_MS.length % 2 === 0 ? result : result === "A" ? "B" : "A";
  const [step, setStep] = useState(0);
  const lit: OptionKey = step % 2 === 0 ? start : start === "A" ? "B" : "A";
  const finished = step >= STEPS_MS.length;

  // 부모가 다시 그려질 때마다 onDone이 새 함수가 되어도 타이머가 처음부터 다시 돌지 않게 한다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = finished
      ? setTimeout(() => onDoneRef.current(), HOLD_MS)
      : setTimeout(() => setStep((s) => s + 1), STEPS_MS[step]);
    return () => clearTimeout(timer);
  }, [step, finished]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5" aria-live="polite">
      <div className="text-center">
        <p className="text-sm text-muted">{round.title}</p>
        <p className="mt-1 text-xl font-bold">
          {round.result!.votesA} 대 {round.result!.votesB} 동점! 🎰 룰렛 돌리는 중…
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {round.options.map((o) => (
          <div
            key={o.key}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-4 transition-colors duration-75 ${
              lit === o.key ? "border-accent bg-accent text-white" : "border-line"
            }`}
          >
            <span className="text-4xl" aria-hidden>
              {o.emoji}
            </span>
            <span className="font-bold">{o.label}</span>
          </div>
        ))}
      </div>
      {finished && (
        <p className="text-center text-lg font-bold">
          {round.options.find((o) => o.key === result)!.emoji} {round.options.find((o) => o.key === result)!.label} 당첨!
        </p>
      )}
    </section>
  );
}
