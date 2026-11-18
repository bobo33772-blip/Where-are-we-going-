import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// 주 버튼은 잉크색 바탕, 강조 버튼(다트 던지기처럼 한 화면에 하나뿐인 동작)은 핀 색 바탕, 보조 버튼은 테두리만.
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-ink text-paper hover:opacity-90",
    accent: "bg-accent text-accent-ink hover:opacity-90",
    secondary: "border border-line bg-surface text-ink hover:border-ink",
    ghost: "text-muted hover:text-ink",
  }[variant];
  return (
    <button
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-12 w-full rounded-md border border-line bg-surface px-4 text-ink outline-none placeholder:text-muted focus:border-ink ${className}`}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}

// 화면 맨 위: 단계 이름(작은 글씨), 큰 제목, 그 아래 숫자 하나. 휴대폰에서 보기 편하게 가운데 정렬
export function ScreenHeader({ step, title, aside }: { step: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      <p className="eyebrow">{step}</p>
      <h1 className="font-display text-3xl leading-tight">{title}</h1>
      {aside}
    </header>
  );
}

// "남은 곳 1,234곳" 같은 숫자 표시
export function Count({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <p className="flex items-baseline justify-center gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-3xl font-bold tabular-nums tracking-tight text-accent">{value}</span>
      <span className="text-sm text-muted">{unit}</span>
    </p>
  );
}

// 참여자 이름표. 고른 사람은 채워진 모양으로 보인다.
export function NameTag({ name, done }: { name: string; done: boolean }) {
  return (
    <li
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
        done ? "border-ink bg-ink text-paper" : "border-line text-muted"
      }`}
    >
      {name}
    </li>
  );
}

// 지도 틀. 화면마다 같은 모양으로 쓴다. 다트 연출처럼 지도 위에 얹는 것은 이 틀을 기준으로 자리를 잡는다.
export function MapFrame({ children, className = "h-64" }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden rounded-md border border-line ${className}`}>{children}</div>;
}
