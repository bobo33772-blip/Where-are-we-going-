"use client";

// 결과 카드(9:16, 릴스·스토리 크기) 이미지를 브라우저의 캔버스로 그린다.
// 서버에서 그리면 한글 글꼴 파일을 따로 넣어야 해서, 기기에 있는 한글 글꼴을 쓰는 캔버스로 그린다.

import type { BoundaryFeature } from "./game/darts";
import { BOUNDARIES_URL } from "./regions";

const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 90;

// 앱과 같은 글꼴을 쓴다. (next/font가 문서에 붙여 둔 글꼴 이름을 읽는다)
function fontStack(variable: string, fallback: string) {
  const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return family ? `${family}, ${fallback}` : fallback;
}

// 앱 화면(밝은 테마)과 같은 색
const COLORS = {
  paper: "#eef1ec",
  ink: "#16212e",
  muted: "#5d6a70",
  line: "#d6ddd4",
  accent: "#1f4fe0",
  sea: "#d5e4ea",
  land: "#b5ca98",
  out: "#e1e4de",
  surface: "#ffffff",
};

// 울릉도까지 들어오는 범위 (독도는 카드에서 빠진다)
const MAP_BOUNDS = { minLng: 124.6, maxLng: 131.0, minLat: 33.1, maxLat: 38.65 };

let boundariesPromise: Promise<BoundaryFeature[]> | null = null;
function loadBoundaries() {
  boundariesPromise ??= fetch(BOUNDARIES_URL)
    .then((res) => {
      if (!res.ok) throw new Error("지도 데이터를 불러오지 못했어요.");
      return res.json() as Promise<{ features: BoundaryFeature[] }>;
    })
    .then((data) => data.features)
    .catch((error) => {
      boundariesPromise = null;
      throw error;
    });
  return boundariesPromise;
}

export type ResultCardInput = {
  regionName: string;
  regionPlace: string;
  winnerCode: string;
  winnerPoint: { lat: number; lng: number };
  distanceText: string | null;
  criteria: string[];
  players: string[];
  excluded: Set<string>;
};

export async function drawResultCard(input: ResultCardInput): Promise<Blob> {
  const fonts = {
    display: fontStack("--nf-display", '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif'),
    body: fontStack("--nf-body", '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'),
    mono: fontStack("--nf-mono", "ui-monospace, monospace"),
  };
  const date = new Date().toLocaleDateString("ko-KR");
  // 캔버스는 글꼴을 스스로 불러오지 않으므로, 쓸 글자가 든 글꼴 조각을 먼저 불러 둔다.
  const bodyText = [input.regionPlace, input.distanceText ?? "", ...input.criteria, ...input.players, "다트로 정한 우리의 다음 여행지 함께한 친구 외 명 우리의 여행 기준"].join(" ");
  await Promise.all([
    document.fonts.load(`120px ${fonts.display}`, `${input.regionName} 야! 우리 어디가??`),
    document.fonts.load(`40px ${fonts.body}`, bodyText),
    document.fonts.load(`600 34px ${fonts.mono}`, `${input.distanceText ?? ""} ${date}`),
  ]).catch(() => {});

  const features = await loadBoundaries();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요.");

  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 34px ${fonts.body}`;
  ctx.fillText("다트로 정한 우리의 다음 여행지", MARGIN, 150);

  ctx.fillStyle = COLORS.ink;
  ctx.font = `${fitFontSize(ctx, input.regionName, 170, WIDTH - MARGIN * 2, fonts.display)}px ${fonts.display}`;
  ctx.fillText(input.regionName, MARGIN, 320);

  ctx.font = `500 46px ${fonts.body}`;
  ctx.fillText(input.regionPlace, MARGIN, 400);
  if (input.distanceText) {
    ctx.fillStyle = COLORS.accent;
    ctx.font = `600 36px ${fonts.body}`;
    ctx.fillText(input.distanceText, MARGIN, 460);
  }

  drawMap(ctx, features, input, { x: MARGIN, y: 510, width: WIDTH - MARGIN * 2, height: 900 });

  // 우리의 여행 기준
  let y = 1490;
  if (input.criteria.length > 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `600 30px ${fonts.body}`;
    ctx.fillText("우리의 여행 기준", MARGIN, y);
    y = drawChips(ctx, input.criteria, y + 28, fonts.body);
  }

  // 아래쪽: 함께한 친구 / 서비스 이름과 날짜
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 1770);
  ctx.lineTo(WIDTH - MARGIN, 1770);
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.font = `500 32px ${fonts.body}`;
  ctx.fillText(playersLine(ctx, input.players, WIDTH - MARGIN * 2), MARGIN, 1830);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 28px ${fonts.mono}`;
  ctx.textAlign = "right";
  ctx.fillText(date, WIDTH - MARGIN, 150);
  ctx.textAlign = "left";
  ctx.font = `28px ${fonts.display}`;
  ctx.fillText("야! 우리 어디가??", MARGIN, 1880);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"),
  );
}

// "함께한 친구: A, B, C" 가 한 줄에 안 들어가면 뒤쪽 이름을 "외 N명"으로 줄인다.
function playersLine(ctx: CanvasRenderingContext2D, players: string[], maxWidth: number) {
  for (let shown = players.length; shown > 0; shown--) {
    const rest = players.length - shown;
    const line = `함께한 친구: ${players.slice(0, shown).join(", ")}${rest > 0 ? ` 외 ${rest}명` : ""}`;
    if (ctx.measureText(line).width <= maxWidth) return line;
  }
  return `함께한 친구 ${players.length}명`;
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, font: string) {
  while (size > 48) {
    ctx.font = `${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 6;
  }
  return size;
}

type Box = { x: number; y: number; width: number; height: number };

function drawMap(ctx: CanvasRenderingContext2D, features: BoundaryFeature[], input: ResultCardInput, box: Box) {
  // 위도 36도 근처에서 경도 1도가 위도 1도보다 짧은 만큼 보정한 단순 투영
  const lngScale = Math.cos((36 * Math.PI) / 180);
  const spanX = (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * lngScale;
  const spanY = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat;
  const scale = Math.min(box.width / spanX, box.height / spanY);
  const offsetX = box.x + (box.width - spanX * scale) / 2;
  const offsetY = box.y + (box.height - spanY * scale) / 2;
  // 지도 칸: 바다색 바탕
  ctx.fillStyle = COLORS.sea;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, 12);
  ctx.fill();

  const project = (lng: number, lat: number): [number, number] => [
    offsetX + (lng - MAP_BOUNDS.minLng) * lngScale * scale,
    offsetY + (MAP_BOUNDS.maxLat - lat) * scale,
  ];

  const paint = (feature: BoundaryFeature, color: string) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    ctx.beginPath();
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach(([lng, lat], i) => {
          const [px, py] = project(lng, lat);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
    }
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  };

  for (const f of features) {
    if (f.properties.code !== input.winnerCode) paint(f, input.excluded.has(f.properties.code) ? COLORS.out : COLORS.land);
  }
  const winner = features.find((f) => f.properties.code === input.winnerCode);
  if (winner) paint(winner, COLORS.accent);

  // 핀
  const [px, py] = project(input.winnerPoint.lng, input.winnerPoint.lat);
  ctx.beginPath();
  ctx.arc(px, py, 18, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.accent;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

function drawChips(ctx: CanvasRenderingContext2D, labels: string[], top: number, font: string) {
  ctx.font = `500 34px ${font}`;
  const padX = 28;
  const gap = 16;
  const height = 64;
  const maxWidth = WIDTH - MARGIN * 2;

  // 줄 단위로 나눠 왼쪽부터 채운다
  const rows: { label: string; width: number }[][] = [[]];
  let rowWidth = 0;
  for (const label of labels) {
    const width = ctx.measureText(label).width + padX * 2;
    if (rowWidth > 0 && rowWidth + gap + width > maxWidth) {
      rows.push([]);
      rowWidth = 0;
    }
    rows.at(-1)!.push({ label, width });
    rowWidth += (rowWidth > 0 ? gap : 0) + width;
  }

  let y = top;
  for (const row of rows) {
    let x = MARGIN;
    for (const chip of row) {
      ctx.fillStyle = COLORS.surface;
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, chip.width, height, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = "center";
      ctx.fillText(chip.label, x + chip.width / 2, y + height / 2 + 12);
      x += chip.width + gap;
    }
    y += height + gap;
  }
  ctx.textAlign = "left";
  return y;
}
