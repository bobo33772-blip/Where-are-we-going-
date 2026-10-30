"use client";

import dynamic from "next/dynamic";

// 지도 라이브러리는 브라우저에서만 동작한다.
export const LazyRegionMap = dynamic(() => import("./RegionMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-line" />,
});
