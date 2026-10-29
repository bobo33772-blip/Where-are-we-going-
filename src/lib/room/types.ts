export type RoomPhase = "lobby" | "criteria" | "darts" | "vote" | "result";

export type Origin = {
  name: string;
  lat: number;
  lng: number;
};

export type PlayerView = {
  id: string;
  nickname: string;
  turnOrder: number;
  isHost: boolean;
};

export type RoomState = {
  code: string;
  phase: RoomPhase;
  origin: Origin | null;
  players: PlayerView[];
};

// 방을 만들거나 참여했을 때 브라우저에 저장하는 내 정보
export type PlayerSession = {
  playerId: string;
  token: string;
};

// 서버가 방 상태가 바뀌었음을 알리는 실시간 채널 이름과 이벤트
export const roomChannelName = (code: string) => `room:${code}`;
export const ROOM_UPDATED_EVENT = "room_updated";
