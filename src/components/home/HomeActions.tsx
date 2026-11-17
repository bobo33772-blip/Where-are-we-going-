"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, ErrorText, TextInput } from "@/components/ui";
import { errorMessage, newPlayerToken, saveSession } from "@/lib/room/client";
import { NICKNAME_MAX_LENGTH, normalizeRoomCode } from "@/lib/room/rules";

export function HomeActions() {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.create);
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
      const token = newPlayerToken();
      const { code, playerId } = await createRoom({ nickname, token });
      saveSession(code, { playerId, token });
      router.push(`/room/${code}`);
    } catch (error) {
      setCreateError(errorMessage(error, "방을 만들지 못했어요."));
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
    <div className="flex flex-col gap-6">
      {/* 방 만들기가 이 화면의 주 동작이라 이것만 카드로 띄운다 */}
      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5 shadow-sm">
        <label htmlFor="create-nickname" className="text-center font-semibold">
          방 만들기
        </label>
        <TextInput
          id="create-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="내 닉네임"
          maxLength={NICKNAME_MAX_LENGTH}
          aria-label="닉네임"
          autoComplete="nickname"
        />
        <ErrorText>{createError}</ErrorText>
        <Button type="submit" disabled={creating || nickname.trim().length === 0}>
          {creating ? "만드는 중…" : "방 만들고 친구 부르기"}
        </Button>
      </form>

      <form onSubmit={handleJoin} className="flex flex-col gap-2">
        <label htmlFor="join-code" className="text-center text-sm text-muted">
          초대받았다면 방 코드로 들어가요
        </label>
        <div className="flex gap-2">
          <TextInput
            id="join-code"
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
          <Button type="submit" variant="secondary" disabled={code.trim().length === 0} className="shrink-0">
            참여
          </Button>
        </div>
        <ErrorText>{joinError}</ErrorText>
      </form>
    </div>
  );
}
