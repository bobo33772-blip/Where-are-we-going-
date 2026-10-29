-- 방과 참여자
--
-- 로그인이 없으므로 참여자는 방에 들어올 때 받은 비밀 토큰으로 자신을 증명한다.
-- DB에는 토큰의 SHA-256 해시만 저장한다.
-- 모든 읽기/쓰기는 서버(Next.js API, secret key)를 거친다. 그래서 RLS를 켜고
-- anon/authenticated 정책은 만들지 않는다.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'criteria', 'darts', 'vote', 'result')),
  host_player_id uuid,
  origin_name text check (char_length(origin_name) <= 40),
  origin_lat double precision check (origin_lat between 33 and 39),
  origin_lng double precision check (origin_lng between 124 and 132),
  created_at timestamptz not null default now(),
  check ((origin_name is null) = (origin_lat is null) and (origin_lat is null) = (origin_lng is null))
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 12),
  token_hash text not null,
  turn_order int not null,
  joined_at timestamptz not null default now(),
  unique (room_id, nickname),
  unique (room_id, turn_order)
);

alter table public.rooms
  add constraint rooms_host_player_id_fkey
  foreign key (host_player_id) references public.players (id) on delete set null;

create index players_room_id_idx on public.players (room_id);

alter table public.rooms enable row level security;
alter table public.players enable row level security;

-- 서버만 테이블에 접근한다. 프로젝트의 기본 권한 설정에 기대지 않도록 명시한다.
revoke all on public.rooms, public.players from anon, authenticated;
grant select, insert, update, delete on public.rooms, public.players to service_role;

-- 방 만들기: 방과 방장을 한 트랜잭션에서 만든다.
create function public.create_room(p_code text, p_nickname text, p_token_hash text)
returns table (room_id uuid, player_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_player_id uuid;
begin
  insert into public.rooms (code) values (p_code) returning id into v_room_id;

  insert into public.players (room_id, nickname, token_hash, turn_order)
  values (v_room_id, p_nickname, p_token_hash, 1)
  returning id into v_player_id;

  update public.rooms set host_player_id = v_player_id where id = v_room_id;

  return query select v_room_id, v_player_id;
end;
$$;

-- 방 참여: 동시에 여러 명이 들어와도 차례 번호가 겹치지 않도록 방 행을 잠근다.
create function public.join_room(p_code text, p_nickname text, p_token_hash text, p_max_players int)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_count int;
  v_player_id uuid;
begin
  select * into v_room from public.rooms where code = p_code for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if v_room.phase <> 'lobby' then
    raise exception 'room_started' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= p_max_players then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  insert into public.players (room_id, nickname, token_hash, turn_order)
  values (
    v_room.id,
    p_nickname,
    p_token_hash,
    (select coalesce(max(turn_order), 0) + 1 from public.players where room_id = v_room.id)
  )
  returning id into v_player_id;

  return v_player_id;
end;
$$;

revoke execute on function public.create_room(text, text, text) from public, anon, authenticated;
revoke execute on function public.join_room(text, text, text, int) from public, anon, authenticated;
grant execute on function public.create_room(text, text, text) to service_role;
grant execute on function public.join_room(text, text, text, int) to service_role;
