import { NextResponse } from "next/server";

import { getStore } from "@/server/store";

export async function GET(): Promise<NextResponse> {
  const store = getStore();
  const stats = await store.dashboard();
  return NextResponse.json(stats, {
    headers: { "cache-control": "no-store" },
  });
}
