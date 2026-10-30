"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useHeartbeat, usePlayerSession } from "@/lib/room/hooks";
import { normalizeRoomCode } from "@/lib/room/rules";
import { CriteriaRound } from "./CriteriaRound";
import { DartsRound } from "./DartsRound";
import { HostAwayBanner } from "./HostAwayBanner";
import { JoinForm } from "./JoinForm";
import { Lobby } from "./Lobby";
import { ResultView } from "./ResultView";
import { VoteRound } from "./VoteRound";

export function RoomClient({ rawCode }: { rawCode: string }) {
  const code = normalizeRoomCode(rawCode);
  if (!code) return <RoomMessage title="방 코드가 올바르지 않아요." />;
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const [session, saveSession] = usePlayerSession(code);
  // Convex 쿼리는 구독이라 방 상태가 바뀌면 모든 참여자 화면이 바로 갱신된다.
  const room = useQuery(api.rooms.get, { code });
  const me = session && room ? room.players.find((p) => p.id === session.playerId) : undefined;
  // 어느 단계에 있든 접속 표시를 보낸다.
  useHeartbeat(code, me && session ? session.token : null);

  // 투표 → 결과로 넘어가는 순간을 이 화면에서 봤을 때만 동점 룰렛을 돌린다. (새로고침하면 결과를 바로 보여준다)
  const [seenPhase, setSeenPhase] = useState<string | null>(null);
  const [spinResult, setSpinResult] = useState(false);
  if (room && room.phase !== seenPhase) {
    if (seenPhase === "vote" && room.phase === "result") setSpinResult(true);
    setSeenPhase(room.phase);
  }

  if (session === undefined || room === undefined) {
    return <RoomMessage title="방을 여는 중…" />;
  }
  if (room === null) {
    return <RoomMessage title="방을 찾을 수 없어요." />;
  }

  // 저장된 참여 정보가 이 방 참여자 목록에 없으면(정보가 오래됨) 다시 참여한다.
  if (!session || !me) {
    return <JoinForm room={room} onJoined={saveSession} />;
  }

  const props = { room, me, token: session.token };
  return (
    <>
      {room.phase !== "result" && <HostAwayBanner {...props} />}
      {room.phase === "lobby" && <Lobby {...props} />}
      {room.phase === "criteria" && <CriteriaRound {...props} />}
      {room.phase === "darts" && <DartsRound {...props} />}
      {room.phase === "vote" && <VoteRound {...props} />}
      {room.phase === "result" && <ResultView room={room} spin={spinResult} onSpinDone={() => setSpinResult(false)} />}
    </>
  );
}

function RoomMessage({ title }: { title: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <Link href="/" className="text-accent underline underline-offset-4">
        처음으로
      </Link>
    </main>
  );
}
