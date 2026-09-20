import { getSnapshot, setScenario, type Scenario } from "@/lib/iris";
import { recordCommsLog } from "@/lib/tiger";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getSnapshot());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { scenario?: Scenario };
  if (!body.scenario || !["nominal", "mild", "dire"].includes(body.scenario)) {
    return Response.json(
      { error: "Valid scenario is required" },
      { status: 400 },
    );
  }
  const snapshot = setScenario(body.scenario);
  const sentAt = new Date();
  void recordCommsLog({
    sentAt,
    receivedAt: sentAt,
    channel: "typed",
    direction: "uplink",
    crewId: snapshot.astronaut.id,
    vesselId: "asteria",
    summary: `[ALERT] Asteria posted ${body.scenario} watch to ground.`,
  });
  return Response.json(snapshot);
}
