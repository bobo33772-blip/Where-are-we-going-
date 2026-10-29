import { HomeActions } from "@/components/home/HomeActions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3 text-center">
        <p className="text-5xl" aria-hidden>
          🎯
        </p>
        <h1 className="text-3xl font-bold tracking-tight">어디로 갈까?</h1>
        <p className="text-muted">
          질문에 답할수록 지도가 줄어들어요.
          <br />
          남은 땅에 다트를 던져서 우리 여행지를 정해요.
        </p>
      </header>

      <HomeActions />

      <ol className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5 text-sm text-muted">
        <li>1. 방을 만들고 친구들에게 링크를 보내요</li>
        <li>2. 밸런스 게임으로 우리만의 여행 기준을 정해요</li>
        <li>3. 남은 지도에 한 명씩 다트를 던져요</li>
        <li>4. 후보 중에서 투표로 최종 여행지를 골라요</li>
      </ol>
    </main>
  );
}
