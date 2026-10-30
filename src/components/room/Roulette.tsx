"use client";

import { useEffect, useRef, useState } from "react";
import type { OptionKey } from "@/lib/game/questions";
import type { RoundView } from "@/lib/room/types";

// 점점 느려지며 두 선택지를 번갈아 비추다가 결과에서 멈춘다. (결과는 서버가 이미 정했다)
const BASE_STEPS_MS = [80, 80, 90, 100, 110, 130, 150, 180, 220, 270, 330, 400, 480];
const HOLD_MS = 1200;

const other = (key: OptionKey): OptionKey => (key === "A" ? "B" : "A");

// 시작 칸은 무작위로 고르고, 칸 수를 맞춰서 마지막에 결과 칸에서 멈추게 한다.
// (시작 칸이 늘 같으면 "처음 켜진 쪽이 진다"는 규칙으로 결과를 미리 알 수 있다)
function plan(result: OptionKey) {
  const start: OptionKey = Math.random() < 0.5 ? "A" : "B";
  // step 번째에 켜지는 칸은 step이 짝수면 start, 홀수면 반대쪽. 끝나는 칸(step = 칸 수)이 결과가 되어야 한다.
  const needEven = start === result;
  const steps = (BASE_STEPS_MS.length % 2 === 0) === needEven ? BASE_STEPS_MS : BASE_STEPS_MS.slice(1);
  return { start, steps };
}

export function Roulette({ round, onDone }: { round: RoundView; onDone: () => void }) {
  const result = round.result!.choice;
  const [{ start, steps }] = useState(() => plan(result));
  const [step, setStep] = useState(0);
  const lit: OptionKey = step % 2 === 0 ? start : other(start);
  const finished = step >= steps.length;

  // 부모가 다시 그려질 때마다 onDone이 새 함수가 되어도 타이머가 처음부터 다시 돌지 않게 한다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = finished
      ? setTimeout(() => onDoneRef.current(), HOLD_MS)
      : setTimeout(() => setStep((s) => s + 1), steps[step]);
    return () => clearTimeout(timer);
  }, [step, finished, steps]);

  const winner = round.options.find((o) => o.key === result)!;

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
          {winner.emoji} {winner.label} 당첨!
        </p>
      )}
    </section>
  );
}
