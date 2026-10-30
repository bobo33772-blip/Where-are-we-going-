# 어디로 갈까? 🎯

친구들과 질문에 답할수록 지도가 줄어들고, 남은 땅에 다트를 던져 여행지를 정하는 웹앱.
설계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), 만든 이유와 결정 근거는 [docs/DECISIONS.md](docs/DECISIONS.md)를 참고하세요.

## 현재 구현된 것 (MVP 중 방·대기실 부분)

- 방 만들기 / 링크·코드로 참여 (로그인 없이 닉네임만, 최대 8명)
- 대기실: 참여자 목록, 접속 표시, 친구 초대(공유·링크 복사)
- 출발지 정하기 (방장만): 주요 역 바로가기 + 읍·면·동 검색
- 읍·면·동 경계 지도 (3,559곳)

MVP의 남은 부분: 기준 라운드(밸런스 게임) → 다트 라운드 → 투표 → 결과 카드

## 기술 구성

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Convex (DB + 실시간 동기화)
- MapLibre GL JS (배경 타일 없이 읍·면·동 경계만 그림)

## 로컬 실행

1. 의존성 설치

   ```bash
   npm install
   ```

2. Convex 개발 서버 실행 (처음 실행하면 Convex 로그인 또는 계정 없는 로컬 실행을 고를 수 있고,
   `.env.local`에 접속 주소가 자동으로 저장됩니다)

   ```bash
   npx convex dev
   ```

3. 다른 터미널에서 Next.js 개발 서버 실행

   ```bash
   npm run dev
   ```

## 구조

```
convex/schema.ts             DB 스키마 (rooms, players, presence)
convex/rooms.ts              방 함수 (만들기, 조회, 참여, 출발지 변경, 접속 표시)
src/app/room/[code]/         방 화면
src/components/room/         참여하기, 대기실, 출발지 선택
src/components/map/          읍·면·동 지도
src/lib/room/                방 규칙(서버·브라우저 공용), 참여 정보 저장, 훅
scripts/build-regions.mjs    경계 데이터 가공 스크립트
public/data/                 가공된 경계(regions.geojson)와 지역 목록(regions.json)
```

### 보안 방식

- 로그인이 없으므로 방에 들어올 때 브라우저가 만든 비밀 토큰으로 참여자를 확인합니다.
  DB에는 토큰의 SHA-256 해시만 저장하고, 조회 결과로 내보내지 않습니다.
- 방장만 할 수 있는 동작(출발지 변경 등)은 Convex 함수 안에서 토큰으로 확인합니다.
- Convex 쿼리는 구독이라, 데이터가 바뀌면 모든 참여자 화면이 자동으로 갱신됩니다.

## 경계 데이터 다시 만들기

```bash
npm run build:regions
```

원본을 내려받아 `public/data/`에 간소화된 경계와 지역 목록을 만듭니다.

## 데이터 출처

본 서비스의 행정동 경계는 국가데이터처(옛 통계청) 통계지리정보서비스([SGIS](https://sgis.mods.go.kr))에서
공공누리 제1유형으로 개방한 행정동 경계를
[vuski/admdongkor](https://github.com/vuski/admdongkor)가 가공한 데이터([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ko))를 사용합니다.

이 서비스에서 바꾼 내용: 경계를 5%로 간소화하고 코드 외 속성을 제거했으며, 지역별 대표점(내부점)을 추출했습니다.
변경된 데이터(`public/data/`)도 CC BY 4.0을 따릅니다.
