import { getSnapshot } from "@/lib/iris";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = getSnapshot();
  return Response.json({
    window: "last 30 minutes",
    vitals: snapshot.vitals.map((metric) => ({
      metric: metric.label,
      current: metric.value,
      baseline: metric.baseline,
      direction: metric.direction,
    })),
  });
}
