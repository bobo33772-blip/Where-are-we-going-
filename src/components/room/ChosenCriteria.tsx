import type { RoundView } from "@/lib/room/types";

// 지금까지 정한 "우리의 여행 기준"
export function ChosenCriteria({ rounds, hideRoundId = null }: { rounds: RoundView[]; hideRoundId?: string | null }) {
  const chosen = rounds
    .filter((r) => r.status === "revealed" && r.result && r.id !== hideRoundId)
    .map((r) => ({ id: r.id, option: r.options.find((o) => o.key === r.result!.choice)! }));

  if (chosen.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-semibold">우리의 여행 기준</h2>
      <ul className="flex flex-wrap gap-2">
        {chosen.map(({ id, option }) => (
          <li key={id} className="rounded-full bg-background px-3 py-1.5 text-sm">
            {option.emoji} {option.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
