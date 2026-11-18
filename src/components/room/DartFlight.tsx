import type { CSSProperties } from "react";
import type { RoomState } from "@/lib/room/types";
import { DartGraphic } from "./DartGraphic";

type Outcome = RoomState["throws"][number]["outcome"];

// 지도 위로 다트가 날아와 꽂히는 연출. 지도가 같은 시간 동안 꽂힐 자리로 움직이므로, 다트는 화면 한가운데로 날아간다.
// 모든 참여자가 같은 세기·같은 시간으로 본다. (세기는 던진 사람의 화면에서 정해져 서버에 함께 저장된다)
export function DartFlight({
  stage,
  outcome,
  flightMs,
  power,
}: {
  stage: "flying" | "impact";
  outcome: Outcome;
  flightMs: number;
  power: number;
}) {
  const stuck = outcome === "hit" || outcome === "snapped";
  const dartClass = stage === "flying" ? "is-flying" : stuck ? "is-hit" : outcome === "sea" ? "is-sea" : "is-outside";
  const vars = { "--power": power } as CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={vars} aria-hidden="true">
      <span className={`dart-shadow ${stage === "impact" && !stuck ? "is-gone" : ""}`} style={{ animationDuration: stage === "flying" ? `${flightMs}ms` : undefined }} />
      {stage === "impact" && stuck && (
        <>
          <span className="impact-ring" />
          <span className="impact-ring" style={{ animationDelay: "120ms" }} />
        </>
      )}
      {stage === "impact" && outcome === "sea" && (
        <>
          <span className="impact-ring is-ripple" />
          <span className="impact-ring is-ripple" style={{ animationDelay: "180ms" }} />
          <span className="impact-ring is-ripple" style={{ animationDelay: "360ms" }} />
        </>
      )}
      {stage === "impact" && outcome === "outside" && <span className="impact-ring is-spark" />}
      <div className={`dart-flyer ${dartClass}`} style={{ animationDuration: stage === "flying" ? `${flightMs}ms` : undefined }}>
        <DartGraphic className="block h-16 w-[22px]" />
      </div>
    </div>
  );
}
