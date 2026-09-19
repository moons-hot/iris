import { getSnapshot } from "@/lib/iris";

export const runtime = "nodejs";

export function GET() {
  const snapshot = getSnapshot();
  return Response.json({
    cabin: snapshot.cabin,
    space: snapshot.space,
    scenario: snapshot.scenario,
  });
}
