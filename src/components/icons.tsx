// 화면에 쓰는 작은 선 아이콘. 글자색(currentColor)을 따라간다.

type IconProps = { className?: string; title?: string };

function Svg({ className = "h-4 w-4", title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// 과녁과 꽂힌 다트
export function DartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="13" r="8" />
      <circle cx="11" cy="13" r="4" />
      <path d="M11 13 20 4M17 4h3v3" />
    </Svg>
  );
}

// 출발지 깃발
export function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </Svg>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 18h16M5 15 3.5 7l5 4L12 5l3.5 6 5-4L19 15z" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V3M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}
