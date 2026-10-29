# 어디로 갈까? 🎯

친구들과 질문에 답할수록 지도가 줄어들고, 남은 땅에 다트를 던져 여행지를 정하는 웹앱.
설계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 참고하세요.

## 현재 구현된 것 (MVP 1단계)

- 방 만들기 / 링크·코드로 참여 (로그인 없이 닉네임만, 최대 8명)
- 대기실: 참여자 목록, 접속 표시, 친구 초대(공유·링크 복사)
- 출발지 정하기 (방장만): 주요 역 바로가기 + 읍·면·동 검색
- 읍·면·동 경계 지도 (3,559곳)

다음 단계: 기준 라운드(밸런스 게임) → 다트 라운드 → 투표 → 결과 카드

## 기술 구성

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres + Realtime)
- MapLibre GL JS (배경 타일 없이 읍·면·동 경계만 그림)

## 로컬 실행

1. 의존성 설치

   ```bash
   npm install
   ```

2. Supabase 프로젝트를 만들고 `supabase/migrations/`의 SQL을 적용합니다.
   (Supabase CLI를 쓰면 `npx supabase link` 후 `npx supabase db push`)

3. `.env.example`을 `.env.local`로 복사하고 키를 채웁니다.

   ```bash
   cp .env.example .env.local
   ```

4. 개발 서버 실행

   ```bash
   npm run dev
   ```

## 구조

```
src/app/api/rooms/...        방 API (만들기, 조회, 참여, 출발지 변경)
src/app/room/[code]/         방 화면
src/components/room/         참여하기, 대기실, 출발지 선택
src/components/map/          읍·면·동 지도
src/lib/room/                방 규칙, 서버 로직, 브라우저 API·훅
supabase/migrations/         DB 스키마
scripts/build-regions.mjs    경계 데이터 가공 스크립트
public/data/                 가공된 경계(regions.geojson)와 지역 목록(regions.json)
```

### 보안 방식

- 로그인이 없으므로 방에 들어올 때 받은 비밀 토큰으로 참여자를 확인합니다. DB에는 토큰 해시만 저장합니다.
- 테이블은 RLS가 켜져 있고 공개 키로는 접근할 수 없습니다. 모든 읽기/쓰기는 서버 API(secret key)를 거칩니다.
- 상태가 바뀌면 서버가 실시간 채널로 알림을 보내고, 각 화면이 상태를 다시 불러옵니다.
  알림을 놓쳐도 15초마다 새로고침합니다.

## 경계 데이터 다시 만들기

```bash
npm run build:regions
```

원본을 내려받아 `public/data/`에 간소화된 경계와 지역 목록을 만듭니다.

## 데이터 출처

본 서비스의 행정동 경계는 통계청 통계지리정보서비스([SGIS](https://sgis.kostat.go.kr))에서
공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며
(가공: [vuski/admdongkor](https://github.com/vuski/admdongkor)), CC BY 4.0으로 배포됩니다.
