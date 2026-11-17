import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

// 제목: 지도 표지 같은 굵은 한글 / 본문: 읽기 편한 한글 / 숫자·코드: 칸이 맞는 고정폭
const display = Black_Han_Sans({ weight: "400", subsets: ["latin"], variable: "--nf-display", preload: false });
const body = IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--nf-body", preload: false });
const mono = IBM_Plex_Mono({ weight: ["500", "600"], subsets: ["latin"], variable: "--nf-mono" });

export const metadata: Metadata = {
  title: "어디로 갈까?",
  description: "친구들과 질문에 답하고, 줄어든 지도에 다트를 던져 여행지를 정해요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#10161d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
