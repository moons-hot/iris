import { NextResponse } from "next/server";

import { getInvestigation } from "@/lib/investigation/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const investigation = getInvestigation(id);

  if (!investigation) {
    return NextResponse.json(
      { error: `Investigation ${id} not found.` },
      { status: 404 },
    );
  }

  return NextResponse.json({ investigation });
}
