"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, ErrorText, TextInput } from "@/components/ui";
import { errorMessage, newPlayerToken } from "@/lib/room/client";
import { MAX_PLAYERS, NICKNAME_MAX_LENGTH } from "@/lib/room/rules";
import type { PlayerSession, RoomState } from "@/lib/room/types";

export function JoinForm({ room, onJoined }: { room: RoomState; onJoined: (session: PlayerSession) => void }) {
  const join = useMutation(api.rooms.join);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = room.players.find((p) => p.isHost);
  const closed = room.phase !== "lobby" || room.players.length >= MAX_PLAYERS;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const token = newPlayerToken();
      const { playerId } = await join({ code: room.code, nickname, token });
      onJoined({ playerId, token });
    } catch (err) {
      setError(errorMessage(err, "참여하지 못했어요."));
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2 text-center">
        <p className="text-5xl" aria-hidden>
          ✈️
        </p>
        <h1 className="text-2xl font-bold">{host ? `${host.nickname}님의 여행 방` : "여행 방"}</h1>
        <p className="text-muted">
          지금 {room.players.length}명 참여 중 · 방 코드 <span className="font-mono font-semibold">{room.code}</span>
        </p>
      </header>

      {closed ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-center">
          {room.phase !== "lobby" ? "이미 시작한 방이라 들어갈 수 없어요." : `방이 가득 찼어요. (최대 ${MAX_PLAYERS}명)`}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
          <TextInput
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="내 닉네임"
            maxLength={NICKNAME_MAX_LENGTH}
            aria-label="닉네임"
            autoComplete="nickname"
            autoFocus
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={joining || nickname.trim().length === 0}>
            {joining ? "들어가는 중…" : "참여하기"}
          </Button>
        </form>
      )}
    </main>
  );
}
