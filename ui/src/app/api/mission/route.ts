import { getSnapshot } from "@/lib/iris";

export const runtime = "nodejs";

export function GET() {
  const snapshot = getSnapshot();
  return Response.json({
    mission: "Asteria Long-Duration Mission",
    day: snapshot.astronaut.missionDay,
    activeAstronaut: snapshot.astronaut,
    scenario: snapshot.scenario,
  });
}
