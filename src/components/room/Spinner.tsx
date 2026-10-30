"use client";

import { useEffect, useRef, useState } from "react";

// 후보들을 차례로 비추며 점점 느려지다가 결과에서 멈춘다. (결과는 서버가 이미 정했다)
const BASE_STEPS_MS = [70, 70, 80, 90, 100, 110, 130, 150, 180, 220, 270, 330, 400, 480];
const HOLD_MS = 1500;

export type SpinItem = { key: string; label: string; sub?: string };

// 시작 칸이 늘 같으면 결과를 미리 알 수 있으므로, 앞부분을 무작위로 몇 칸 건너뛰어 시작 칸을 바꾼다.
function plan(count: number, resultIndex: number) {
  const steps = BASE_STEPS_MS.slice(Math.floor(Math.random() * count));
  // step 번째 칸 = (start + step) % count, 마지막(step = steps.length)이 결과가 되도록 start를 정한다.
  const start = (((resultIndex - steps.length) % count) + count) % count;
  return { steps, start };
}

export function Spinner({ items, resultKey, onDone }: { items: SpinItem[]; resultKey: string; onDone: () => void }) {
  const resultIndex = Math.max(0, items.findIndex((i) => i.key === resultKey));
  const [{ steps, start }] = useState(() => plan(items.length, resultIndex));
  const [step, setStep] = useState(0);
  const finished = step >= steps.length;
  const lit = (start + step) % items.length;

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const timer = finished ? setTimeout(() => onDoneRef.current(), HOLD_MS) : setTimeout(() => setStep((s) => s + 1), steps[step]);
    return () => clearTimeout(timer);
  }, [step, finished, steps]);

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {items.map((item, i) => (
        <li
          key={item.key}
          className={`rounded-xl border-2 px-4 py-3 transition-colors duration-75 ${
            i === lit ? "border-accent bg-accent text-white" : "border-line"
          }`}
        >
          <span className="font-bold">{item.label}</span>
          {item.sub && <span className={`ml-2 text-sm ${i === lit ? "text-white/80" : "text-muted"}`}>{item.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
