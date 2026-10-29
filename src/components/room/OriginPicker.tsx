"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@/components/ui";
import { loadRegions, ORIGIN_PRESETS, searchRegions, type Region } from "@/lib/regions";
import type { Origin } from "@/lib/room/types";

type Props = {
  value: Origin | null;
  disabled: boolean;
  onChange: (origin: Origin) => void;
};

// 자주 쓰는 역을 고르거나, 읍·면·동 이름으로 검색해서 출발지를 정한다.
export function OriginPicker({ value, disabled, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length === 0 || regions) return;
    loadRegions()
      .then(setRegions)
      .catch((error: Error) => setLoadError(error.message));
  }, [query, regions]);

  const results = regions ? searchRegions(regions, query) : [];

  function pick(origin: Origin) {
    setQuery("");
    onChange(origin);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {ORIGIN_PRESETS.map((preset) => {
          const selected = value?.name === preset.name;
          return (
            <button
              key={preset.name}
              type="button"
              disabled={disabled}
              onClick={() => pick(preset)}
              aria-pressed={selected}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                selected ? "border-accent bg-accent text-white" : "border-line hover:border-accent"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="동네 이름으로 찾기 (예: 연남동, 성산읍)"
          aria-label="출발지 검색"
          disabled={disabled}
        />
        {query.trim().length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-card shadow-lg">
            {loadError && <li className="px-4 py-3 text-sm text-red-600">{loadError}</li>}
            {!loadError && !regions && <li className="px-4 py-3 text-sm text-muted">불러오는 중…</li>}
            {regions && results.length === 0 && <li className="px-4 py-3 text-sm text-muted">검색 결과가 없어요.</li>}
            {results.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => pick({ name: `${r.sgg} ${r.name}`, lat: r.lat, lng: r.lng })}
                  className="w-full px-4 py-3 text-left hover:bg-background"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-sm text-muted">
                    {r.sido} {r.sgg}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {value && <p className="text-sm">🚩 지금 출발지: <span className="font-semibold">{value.name}</span></p>}
    </div>
  );
}
