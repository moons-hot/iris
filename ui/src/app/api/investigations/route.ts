export const runtime = "nodejs";

export async function POST() {
  return Response.json({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    astronautId: "A01",
    status: "active",
  });
}
