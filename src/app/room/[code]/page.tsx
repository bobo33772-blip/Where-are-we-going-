import { Suspense } from "react";
import { RoomClient } from "@/components/room/RoomClient";

export default function RoomPage({ params }: PageProps<"/room/[code]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted">방을 여는 중…</p>}>
      <RoomCode params={params} />
    </Suspense>
  );
}

async function RoomCode({ params }: { params: PageProps<"/room/[code]">["params"] }) {
  const { code } = await params;
  return <RoomClient rawCode={code} />;
}
