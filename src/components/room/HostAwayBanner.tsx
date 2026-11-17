"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CrownIcon } from "@/components/icons";
import { errorMessage } from "@/lib/room/client";
import { useHostAway } from "@/lib/room/hooks";
import type { PlayerView, RoomState } from "@/lib/room/types";

// 방장이 오래 접속하지 않으면 다른 참여자가 방장을 이어받아 게임을 계속할 수 있게 한다.
export function HostAwayBanner({ room, me, token }: { room: RoomState; me: PlayerView; token: string }) {
  const host = room.players.find((p) => p.isHost) ?? null;
  const away = useHostAway(room.code, host?.id ?? null);
  const claimHost = useMutation(api.rooms.claimHost);
  const [error, setError] = useState<string | null>(null);

  if (me.isHost || !away) return null;

  return (
    <div className="gutter mx-auto mt-3 flex w-full max-w-md flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-md border border-ink px-4 py-3 text-sm">
        <span>{host ? `방장 ${host.nickname}님이 2분 넘게 자리를 비웠어요.` : "방장이 없어요."}</span>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ink px-3 py-1.5 font-semibold text-paper"
          onClick={() => claimHost({ code: room.code, token }).catch((err) => setError(errorMessage(err, "이어받지 못했어요.")))}
        >
          <CrownIcon className="h-4 w-4" />
          방장 이어받기
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
