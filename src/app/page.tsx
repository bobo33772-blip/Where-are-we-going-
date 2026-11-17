import { HomeActions } from "@/components/home/HomeActions";

const STEPS = [
  ["방 만들기", "링크를 보내 친구들을 불러요."],
  ["기준 정하기", "밸런스 게임에 답할 때마다 지도가 줄어들어요."],
  ["다트 던지기", "남은 땅에 한 명씩, 바다에 빠지면 다시."],
  ["투표", "꽂힌 곳 중에서 다 같이 골라요."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 gutter py-12">
      <header className="flex flex-col gap-4">
        <p className="eyebrow">친구 여행지 정하기</p>
        <h1 className="font-display text-5xl leading-[1.05]">
          야! 우리
          <br />
          어디가??
        </h1>
        <p className="max-w-[30ch] text-muted">
          질문에 답할수록 지도가 줄어들어요. 남은 땅에 다트를 던져서 우리 여행지를 정해요.
        </p>
      </header>

      <HomeActions />

      {/* 한 판의 순서. 실제 진행 순서라 번호를 붙인다. */}
      <ol className="flex flex-col border-t border-line">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="grid grid-cols-[2rem_1fr] gap-x-2 border-b border-line py-3 text-sm">
            <span className="font-mono text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="font-semibold">{title}</span>
              <span className="ml-2 text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
