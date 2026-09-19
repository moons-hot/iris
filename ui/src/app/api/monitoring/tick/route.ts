import { getSnapshot, setScenario, type Scenario } from "@/lib/iris";

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
  return Response.json(setScenario(body.scenario));
}
