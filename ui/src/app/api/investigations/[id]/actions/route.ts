import { NextResponse } from "next/server";
import { z } from "zod";

import { applyInvestigationAction } from "@/lib/investigation/service";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record_measurement"),
    metricKey: z.enum(["heart_rate", "spo2", "temp_c"]),
    value: z.number(),
  }),
  z.object({
    action: z.literal("check_environment"),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const investigation = applyInvestigationAction(id, parsed.data);
    return NextResponse.json({ investigation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply action.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
