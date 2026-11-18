// 끝이 위를 향한 다트 그림. 던지는 판과 지도 위 연출에서 같이 쓴다.
// 위쪽 끝(0, 가운데)이 다트 끝이라, 연출에서는 이 점을 꽂히는 자리에 맞춘다.
export function DartGraphic({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 72" className={className} aria-hidden="true">
      <path d="M12 0 13.4 15h-2.8z" fill="var(--muted)" />
      <rect x="9.2" y="15" width="5.6" height="19" rx="2.2" fill="var(--ink)" />
      <path d="M9.2 20h5.6M9.2 24h5.6M9.2 28h5.6" stroke="var(--paper)" strokeWidth="1" opacity="0.45" />
      <rect x="11.1" y="34" width="1.8" height="14" fill="var(--ink)" />
      <path d="M12 43 3 68l9-5 9 5z" fill="var(--accent)" />
      <path d="M12 43v20" stroke="var(--accent-ink)" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
