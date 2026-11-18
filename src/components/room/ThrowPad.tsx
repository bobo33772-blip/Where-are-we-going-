"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { unlockAudio, vibrate } from "@/lib/sfx";
import { DartGraphic } from "./DartGraphic";

// 다트 던지기. 지도 아랫부분에 다트를 세워 두고, 지도 쪽으로 던진다. 두 가지로 던질 수 있다.
//  1) 위로 튕기기: 다트를 손가락으로 끌어 올리다 놓는다. 어디서나 된다.
//  2) 휘두르기: 다트를 누른 채 폰을 앞으로 휘두른다. 움직임 센서를 쓸 수 있을 때만 된다.
//     (아이폰은 한 번 허용이 필요하고, https가 아니거나 센서가 없으면 1번만 쓴다)
// 던진 세기(0~1)는 날아가는 연출에만 쓰고, 어디에 꽂히는지는 서버가 정한다.

// 위로 튕기기: 손을 떼기 직전 이 속도(px/ms)보다 빨라야 날아가고, 이 범위 안에서 세기가 정해진다.
const FLICK_MIN_SPEED = 0.4;
const FLICK_MAX_SPEED = 2.5;
const FLICK_MIN_DISTANCE = 36;
// 천천히 밀어 올려도 이만큼 올리면 약하게 날아간다. (답답하지 않게)
const PUSH_DISTANCE = 96;
// 휘두르기: 중력을 뺀 가속도(m/s²). 다트를 누르고 있는 동안만 보므로, 걷거나 손이 조금 흔들리는 정도로는 넘지 않게 잡았다.
const SWING_MIN = 13;
const SWING_MAX = 35;
// 휘두르기가 시작된 뒤 가장 센 순간을 잡으려고 잠깐 더 지켜본다.
const SWING_PEAK_MS = 80;
// 센서 신호가 이 시간 안에 안 오면 휘두르기 없이 튕기기만 쓴다.
const MOTION_PROBE_MS = 2000;

const MOTION_PREF_KEY = "wawg:motion";

type MotionState = "checking" | "unsupported" | "needs-permission" | "asking" | "denied" | "ready";
type MotionApi = typeof DeviceMotionEvent & { requestPermission?: () => Promise<PermissionState> };

// 이 화면을 연 동안 한 번 허용받았으면, 다음 차례에 다시 묻지 않는다.
let grantedThisPage = false;

function motionApi(): MotionApi | null {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window ? (window.DeviceMotionEvent as MotionApi) : null;
}

// 먼저 센서 신호가 오는지 본다. 안드로이드 크롬은 허용 없이 바로 온다.
// (요즘 크롬에도 requestPermission이 생겼지만 기본은 허용이라, 이 함수가 있다고 아이폰이라 단정하지 않는다)
function initialMotion(): MotionState {
  return motionApi() ? "checking" : "unsupported";
}

// 신호가 안 올 때: 허용을 물어볼 수 있는 휴대폰(아이폰 등)이면 버튼을 보여주고, 아니면 튕기기만 쓴다.
// (PC 크롬에도 이 함수가 있지만 센서가 없으니, 손가락으로 누르는 화면에서만 버튼을 띄운다)
function motionWithoutSignal(): MotionState {
  const canAsk = typeof motionApi()?.requestPermission === "function" && window.matchMedia("(pointer: coarse)").matches;
  return canAsk && !grantedThisPage ? "needs-permission" : "unsupported";
}

function motionPref(): boolean {
  try {
    return localStorage.getItem(MOTION_PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function saveMotionPref(on: boolean) {
  try {
    localStorage.setItem(MOTION_PREF_KEY, on ? "on" : "off");
  } catch {
    // 저장 못 하면 다음에 다시 버튼으로 켠다.
  }
}

// 아이폰: 사용자가 화면을 누른 그 순간에만 물어볼 수 있다. 이미 허용했으면 다시 묻지 않고 바로 허용된다.
async function askMotion(set: (state: MotionState) => void) {
  const api = motionApi();
  if (!api?.requestPermission) return;
  set("asking");
  try {
    const result = await api.requestPermission();
    if (result === "granted") {
      grantedThisPage = true;
      saveMotionPref(true);
      set("checking");
    } else if (result === "denied") {
      saveMotionPref(false);
      set("denied");
    } else {
      // 아직 정하지 않음(누르는 순간이 아니었던 경우 등). 버튼을 다시 보여준다.
      set("needs-permission");
    }
  } catch {
    // 누르는 순간이 아니었거나, 앱 안 브라우저가 지원하지 않는 경우
    set("unsupported");
  }
}

function swingStrength(e: DeviceMotionEvent): number | null {
  const a = e.acceleration;
  if (a && a.x !== null && a.y !== null && a.z !== null) return Math.hypot(a.x, a.y, a.z);
  const g = e.accelerationIncludingGravity;
  if (g && g.x !== null && g.y !== null && g.z !== null) return Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  return null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  maxY: number;
  samples: { y: number; t: number }[];
  thrown: boolean;
};

// 지도 위 던지는 자리(laneSlot에 그린다)와 지도 아래 안내를 함께 그린다.
// 던지는 자리는 지도 틀 안에 있어야 해서 포털로 그 자리에 붙인다. (작은 휴대폰에서도 지도를 보면서 던지도록)
export function ThrowPad({
  laneSlot,
  disabled,
  flying,
  resetKey,
  onThrow,
}: {
  // 지도 틀 안의 빈 자리
  laneSlot: HTMLElement | null;
  disabled: boolean;
  // 다트가 지도 위를 날아가는 중. 이때 던지는 자리의 다트를 숨긴다. (지도 위 연출이 이어받는다)
  flying: boolean;
  // 차례·기회가 바뀌면 다트를 다시 세워 둔다.
  resetKey: string;
  // 던지기에 실패하면 false를 돌려준다. (다트를 다시 세워 둔다)
  onThrow: (power: number) => Promise<boolean>;
}) {
  const [motion, setMotion] = useState<MotionState>(initialMotion);
  const [launchedFor, setLaunchedFor] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  const helpId = useId();
  const dartRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const swingRef = useRef<{ peak: number; timer: number } | null>(null);
  const launched = launchedFor === resetKey;
  const locked = disabled || launched;
  const hidden = launched && flying;

  function moveDart(x: number, y: number) {
    dartRef.current?.style.setProperty("--x", `${x}px`);
    dartRef.current?.style.setProperty("--y", `${y}px`);
  }

  function cancelSwing() {
    if (swingRef.current) clearTimeout(swingRef.current.timer);
    swingRef.current = null;
  }

  function launch(power: number) {
    if (locked) return;
    if (gestureRef.current) gestureRef.current.thrown = true;
    cancelSwing();
    setLaunchedFor(resetKey);
    setHint(null);
    vibrate(12);
    void onThrow(power).then((ok) => {
      if (!ok) {
        setLaunchedFor(null);
        moveDart(0, 0);
      }
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (locked || gestureRef.current) return;
    unlockAudio();
    e.currentTarget.setPointerCapture(e.pointerId);
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      maxY: e.clientY,
      samples: [{ y: e.clientY, t: e.timeStamp }],
      thrown: false,
    };
    setHolding(true);
    setHint(null);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || g.thrown) return;
    g.samples.push({ y: e.clientY, t: e.timeStamp });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 120) g.samples.shift();
    g.maxY = Math.max(g.maxY, e.clientY);
    // 아래로 살짝 당겼다가(뒤로 젖히기) 위로 튕기는 동작이 자연스럽게 보이도록 다트가 손가락을 따라온다.
    moveDart(Math.max(-40, Math.min(40, (e.clientX - g.startX) * 0.4)), Math.max(-48, Math.min(16, e.clientY - g.startY)));
  }

  function endGesture(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setHolding(false);
    cancelSwing();
    if (g.thrown) return;

    const recent = g.samples.filter((s) => e.timeStamp - s.t <= 80);
    const from = recent[0] ?? g.samples[g.samples.length - 1];
    const speed = (from.y - e.clientY) / Math.max(16, e.timeStamp - from.t);
    const distance = g.maxY - e.clientY;
    if (!cancelled && ((speed >= FLICK_MIN_SPEED && distance >= FLICK_MIN_DISTANCE) || distance >= PUSH_DISTANCE)) {
      launch(clamp01((speed - FLICK_MIN_SPEED) / (FLICK_MAX_SPEED - FLICK_MIN_SPEED)));
      return;
    }
    moveDart(0, 0);
    if (cancelled) return;
    setHint(distance < 8 ? "다트를 위로 튕겨야 날아가요" : "조금 더 빠르게 튕겨 보세요");
    setNudge((n) => n + 1);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    unlockAudio();
    launch(0.5);
  }

  // 센서 신호: 처음 들어오면 휘두르기를 켜고, 다트를 누르고 있을 때 세게 휘두르면 던진다.
  const onMotion = useEffectEvent((e: DeviceMotionEvent) => {
    const strength = swingStrength(e);
    if (strength === null) return;
    if (motion === "checking") setMotion("ready");
    const g = gestureRef.current;
    if (!g || g.thrown || locked) return;
    if (swingRef.current) {
      swingRef.current.peak = Math.max(swingRef.current.peak, strength);
      return;
    }
    if (strength < SWING_MIN) return;
    const swing = { peak: strength, timer: 0 };
    swing.timer = window.setTimeout(() => {
      swingRef.current = null;
      if (gestureRef.current === g && !g.thrown) launch(clamp01((swing.peak - SWING_MIN) / (SWING_MAX - SWING_MIN)));
    }, SWING_PEAK_MS);
    swingRef.current = swing;
  });

  const listening = motion === "checking" || motion === "ready";
  useEffect(() => {
    if (!listening) return;
    const handler = (e: DeviceMotionEvent) => onMotion(e);
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [listening]);

  // 신호가 안 오면 허용 버튼을 보여주거나(아이폰), 휘두르기 안내를 숨긴다(센서 없음, https 아님, 일부 앱 안 브라우저).
  useEffect(() => {
    if (motion !== "checking") return;
    const timer = setTimeout(() => setMotion((m) => (m === "checking" ? motionWithoutSignal() : m)), MOTION_PROBE_MS);
    return () => clearTimeout(timer);
  }, [motion]);

  // 아이폰에서 예전에 휘두르기를 켰던 사람은, 이 화면에서 처음 손을 뗄 때 조용히 다시 켠다.
  useEffect(() => {
    if (motion !== "needs-permission" || !motionPref()) return;
    const handler = () => void askMotion(setMotion);
    document.addEventListener("touchend", handler, { once: true, capture: true });
    return () => document.removeEventListener("touchend", handler, { capture: true });
  }, [motion]);

  useEffect(() => {
    const swing = swingRef;
    return () => {
      if (swing.current) clearTimeout(swing.current.timer);
    };
  }, []);

  function throwByButton() {
    unlockAudio();
    launch(0.5);
  }

  const statusText = launched
    ? "다트가 날아가는 중이에요"
    : locked
      ? "잠시만요"
      : motion === "ready"
        ? "지도 아래 다트를 누른 채 폰을 휘두르거나 위로 튕겨요"
        : "지도 아래 다트를 위로 튕겨서 던져요";

  // 지도 아랫부분의 던지는 자리. 여기서 위로 튕기면 다트가 바로 지도 쪽으로 날아간다. (누르는 동안 지도는 끌려가지 않는다)
  const lane = (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked}
      aria-label="다트 던지기"
      aria-describedby={helpId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e, false)}
      onPointerCancel={(e) => endGesture(e, true)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      className={`throw-lane absolute inset-0 flex touch-none select-none flex-col items-center ${
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {!locked && (
        <span className="mt-3 flex flex-col items-center text-accent" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 24 12" className="pad-chevron -mt-1 h-3 w-6" style={{ animationDelay: `${(2 - i) * 180}ms` }}>
              <path d="M4 10 12 3l8 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ))}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <div
          key={nudge}
          ref={dartRef}
          className={`pad-dart ${holding ? "is-dragging" : ""} ${
            hidden ? "is-hidden" : launched ? "is-launched" : nudge > 0 ? "is-nudge" : ""
          } ${locked && !launched ? "opacity-50" : ""}`}
        >
          <DartGraphic className={`block h-20 w-[27px] drop-shadow-md transition-transform ${holding ? "scale-110" : ""}`} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {laneSlot && createPortal(lane, laneSlot)}
      <div className="flex flex-col items-center gap-3">
        <p id={helpId} className="text-balance break-keep text-center text-sm font-semibold">
          {statusText}
        </p>
        <MotionControl motion={motion} onEnable={() => void askMotion(setMotion)} />
        {hint && (
          <p className="text-center text-sm font-semibold text-accent" role="status">
            {hint}
          </p>
        )}
        <button
          type="button"
          disabled={locked}
          onClick={throwByButton}
          className="text-xs text-muted underline underline-offset-4 disabled:opacity-40"
        >
          버튼으로 던지기
        </button>
      </div>
    </>
  );
}

function MotionControl({ motion, onEnable }: { motion: MotionState; onEnable: () => void }) {
  if (motion === "ready") {
    return <p className="text-center text-xs text-muted">폰을 꼭 쥐고, 손목만 가볍게 휘둘러 주세요.</p>;
  }
  if (motion === "needs-permission" || motion === "asking") {
    return (
      <button
        type="button"
        onClick={onEnable}
        disabled={motion === "asking"}
        className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink transition hover:border-ink disabled:opacity-60"
      >
        {motion === "asking" ? "허용을 기다리는 중…" : "폰 휘둘러 던지기 켜기"}
      </button>
    );
  }
  if (motion === "denied") {
    return <p className="text-center text-xs text-muted">움직임 사용을 허용하지 않아서, 위로 튕겨서 던져요.</p>;
  }
  return null;
}
