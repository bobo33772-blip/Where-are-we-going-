"use client";

import { useEffect, useSyncExternalStore } from "react";

// 다트 효과음과 진동. 소리 파일 없이 브라우저에서 직접 합성한다. (저작권 걱정 없음, 내려받을 것 없음)
// 브라우저는 사용자가 화면을 한 번 터치한 뒤에만 소리를 내게 해서, 첫 터치 때 unlockAudio()로 소리를 켠다.

const MUTE_KEY = "wawg:sound";

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // 소리를 못 내는 환경이면 조용히 넘어간다.
  }
}

// 방 화면 어디든 처음 누를 때 소리를 켠다. (다트가 날아오기 전에 미리 켜 두려고 방 전체에 건다)
export function useAudioUnlock() {
  useEffect(() => {
    const events = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    const handler = () => {
      unlockAudio();
      if (ctx?.state === "running") for (const e of events) document.removeEventListener(e, handler, true);
    };
    for (const e of events) document.addEventListener(e, handler, true);
    return () => {
      for (const e of events) document.removeEventListener(e, handler, true);
    };
  }, []);
}

// 저장을 못 하는 환경(사생활 보호 모드 등)에서도 이번 화면에서는 켜고 끄기가 되도록 값을 따로 들고 있는다.
let mutedNow: boolean | null = null;
const muteListeners = new Set<() => void>();

export function isMuted(): boolean {
  if (mutedNow === null) {
    try {
      mutedNow = localStorage.getItem(MUTE_KEY) === "off";
    } catch {
      mutedNow = false;
    }
  }
  return mutedNow;
}

export function setMuted(muted: boolean) {
  mutedNow = muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
  } catch {
    // 저장 못 하면 이번 화면에서만 적용된다.
  }
  for (const listener of muteListeners) listener();
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      muteListeners.add(listener);
      return () => muteListeners.delete(listener);
    },
    isMuted,
    () => false,
  );
}

// 진동은 안드로이드 크롬 등에서만 된다. 아이폰 Safari는 지원하지 않아 아무 일도 일어나지 않는다.
export function vibrate(pattern: number | number[]) {
  if (isMuted()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 무시
  }
}

function ready(): AudioContext | null {
  if (!ctx || ctx.state !== "running" || isMuted()) return null;
  return ctx;
}

function noise(audio: AudioContext, seconds: number) {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  return source;
}

// 슉: 높아지는 바람 소리
export function playWhoosh(durationMs: number, power = 0.5) {
  const audio = ready();
  if (!audio) return;
  const t = audio.currentTime;
  const sec = durationMs / 1000;
  const src = noise(audio, sec);
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(1200 + power * 1800, t + sec * 0.7);
  filter.frequency.exponentialRampToValueAtTime(500, t + sec);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25 + power * 0.25, t + sec * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(t);
  src.stop(t + sec);
}

// 탁: 낮은 울림 + 짧은 딱 소리
export function playThunk() {
  const audio = ready();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  const body = audio.createGain();
  body.gain.setValueAtTime(0.7, t);
  body.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(body).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.26);

  const click = noise(audio, 0.04);
  const hp = audio.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const clickGain = audio.createGain();
  clickGain.gain.setValueAtTime(0.35, t);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  click.connect(hp).connect(clickGain).connect(audio.destination);
  click.start(t);
}

// 첨벙: 낮아지며 사라지는 물소리
export function playSplash() {
  const audio = ready();
  if (!audio) return;
  const t = audio.currentTime;
  const src = noise(audio, 0.6);
  const lp = audio.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(4000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.55);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.connect(lp).connect(gain).connect(audio.destination);
  src.start(t);
}

// 팅: 튕겨 나가는 소리
export function playBounce() {
  const audio = ready();
  if (!audio) return;
  const t = audio.currentTime;
  for (const [delay, freq] of [
    [0, 700],
    [0.09, 480],
  ] as const) {
    const osc = audio.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t + delay);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.3, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.08);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.09);
  }
}

// 다트가 떨어진 결과에 맞는 소리와 진동
export function playImpact(outcome: "hit" | "snapped" | "sea" | "outside") {
  if (outcome === "hit" || outcome === "snapped") {
    playThunk();
    vibrate([35, 40, 20]);
  } else if (outcome === "sea") {
    playSplash();
    vibrate(20);
  } else {
    playBounce();
    vibrate([12, 30, 12]);
  }
}
