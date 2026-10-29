"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { usePlayerSession } from "@/lib/room/hooks";
import { normalizeRoomCode } from "@/lib/room/rules";
import { JoinForm } from "./JoinForm";
import { Lobby } from "./Lobby";

export function RoomClient({ rawCode }: { rawCode: string }) {
  const code = normalizeRoomCode(rawCode);
  if (!code) return <RoomMessage title="방 코드가 올바르지 않아요." />;
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const [session, saveSession] = usePlayerSession(code);
  // Convex 쿼리는 구독이라 방 상태가 바뀌면 모든 참여자 화면이 바로 갱신된다.
  const room = useQuery(api.rooms.get, { code });

  if (session === undefined || room === undefined) {
    return <RoomMessage title="방을 여는 중…" />;
  }
  if (room === null) {
    return <RoomMessage title="방을 찾을 수 없어요." />;
  }

  // 저장된 참여 정보가 이 방 참여자 목록에 없으면(정보가 오래됨) 다시 참여한다.
  const me = session ? room.players.find((p) => p.id === session.playerId) : undefined;

  if (!session || !me) {
    return <JoinForm room={room} onJoined={saveSession} />;
  }

  if (room.phase === "lobby") {
    return <Lobby room={room} me={me} token={session.token} />;
  }

  return <RoomMessage title="다음 단계는 준비 중이에요." />;
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
