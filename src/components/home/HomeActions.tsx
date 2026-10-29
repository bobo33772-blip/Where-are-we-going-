"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorText, TextInput } from "@/components/ui";
import { api, saveSession } from "@/lib/room/client";
import { NICKNAME_MAX_LENGTH, normalizeRoomCode } from "@/lib/room/rules";

export function HomeActions() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const { code, ...session } = await api.createRoom(nickname);
      saveSession(code, session);
      router.push(`/room/${code}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "방을 만들지 못했어요.");
      setCreating(false);
    }
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setJoinError("방 코드 6자리를 입력해 주세요.");
      return;
    }
    router.push(`/room/${normalized}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">방 만들기</h2>
        <TextInput
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="내 닉네임"
          maxLength={NICKNAME_MAX_LENGTH}
          aria-label="닉네임"
          autoComplete="nickname"
        />
        <ErrorText>{createError}</ErrorText>
        <Button type="submit" disabled={creating || nickname.trim().length === 0}>
          {creating ? "만드는 중…" : "방 만들기"}
        </Button>
      </form>

      <form onSubmit={handleJoin} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">코드로 참여하기</h2>
        <TextInput
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setJoinError(null);
          }}
          placeholder="방 코드 6자리"
          maxLength={6}
          aria-label="방 코드"
          autoCapitalize="characters"
          autoComplete="off"
          className="font-mono tracking-[0.3em] uppercase placeholder:font-sans placeholder:tracking-normal"
        />
        <ErrorText>{joinError}</ErrorText>
        <Button type="submit" variant="secondary" disabled={code.trim().length === 0}>
          참여하기
        </Button>
      </form>
    </div>
  );
}
