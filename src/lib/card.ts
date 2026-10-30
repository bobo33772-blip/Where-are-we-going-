"use client";

// 결과 카드(9:16, 릴스·스토리 크기) 이미지를 브라우저의 캔버스로 그린다.
// 서버에서 그리면 한글 글꼴 파일을 따로 넣어야 해서, 기기에 있는 한글 글꼴을 쓰는 캔버스로 그린다.

import type { BoundaryFeature } from "./game/darts";
import { BOUNDARIES_URL } from "./regions";

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

const COLORS = {
  background: "#fff7ed",
  text: "#1c1917",
  muted: "#78716c",
  accent: "#ea580c",
  land: "#fdba74",
  out: "#e7e5e4",
  winner: "#dc2626",
  chip: "#ffffff",
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
  const features = await loadBoundaries();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요.");

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLORS.accent;
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText("🎯 다트로 정한 우리의 다음 여행지", WIDTH / 2, 150);

  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${fitFontSize(ctx, input.regionName, 150, 900)}px ${FONT}`;
  ctx.fillText(input.regionName, WIDTH / 2, 320);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `48px ${FONT}`;
  ctx.fillText(input.regionPlace, WIDTH / 2, 400);
  if (input.distanceText) {
    ctx.font = `36px ${FONT}`;
    ctx.fillText(input.distanceText, WIDTH / 2, 460);
  }

  drawMap(ctx, features, input, { x: 90, y: 510, width: 900, height: 900 });

  // 우리의 여행 기준
  let y = 1480;
  if (input.criteria.length > 0) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText("우리의 여행 기준", WIDTH / 2, y);
    y = drawChips(ctx, input.criteria, y + 40);
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = `34px ${FONT}`;
  ctx.fillText(`함께한 친구: ${input.players.join(", ")}`, WIDTH / 2, Math.max(y + 70, 1780), 960);
  ctx.font = `30px ${FONT}`;
  ctx.fillText(`어디로 갈까? · ${new Date().toLocaleDateString("ko-KR")}`, WIDTH / 2, 1860);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"),
  );
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number) {
  while (size > 48) {
    ctx.font = `bold ${size}px ${FONT}`;
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
  if (winner) paint(winner, COLORS.winner);

  // 핀
  const [px, py] = project(input.winnerPoint.lng, input.winnerPoint.lat);
  ctx.beginPath();
  ctx.arc(px, py, 18, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.winner;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

function drawChips(ctx: CanvasRenderingContext2D, labels: string[], top: number) {
  ctx.font = `36px ${FONT}`;
  const padX = 28;
  const gap = 16;
  const height = 64;
  const maxWidth = 960;

  // 줄 단위로 나눈 뒤 가운데 정렬
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
    const total = row.reduce((sum, c) => sum + c.width, 0) + gap * (row.length - 1);
    let x = (WIDTH - total) / 2;
    for (const chip of row) {
      ctx.fillStyle = COLORS.chip;
      ctx.beginPath();
      ctx.roundRect(x, y, chip.width, height, height / 2);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.fillText(chip.label, x + chip.width / 2, y + height / 2 + 12);
      x += chip.width + gap;
    }
    y += height + gap;
  }
  return y;
}
