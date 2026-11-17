import type { RoundView } from "@/lib/room/types";

// 지금까지 정한 "우리의 여행 기준". 정한 순서대로 쌓인다.
export function ChosenCriteria({ rounds, hideRoundId = null }: { rounds: RoundView[]; hideRoundId?: string | null }) {
  const chosen = rounds
    .filter((r) => r.status === "revealed" && r.result && r.id !== hideRoundId)
    .map((r) => ({ id: r.id, option: r.options.find((o) => o.key === r.result!.choice)! }));

  if (chosen.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">우리의 여행 기준</h2>
      <ul className="flex flex-wrap gap-2">
        {chosen.map(({ id, option }) => (
          <li key={id} className="rounded-sm border border-line bg-surface px-2.5 py-1 text-sm">
            {option.label}
            <span className="ml-1.5 text-xs text-muted">{option.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
