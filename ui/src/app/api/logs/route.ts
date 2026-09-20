import { isTigerConfigured, listCommsLogs } from "@/lib/tiger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "25");
  const vesselId = searchParams.get("vesselId") ?? undefined;
  const parsedLimit = Number.isFinite(limit) ? limit : 25;

  try {
    const logs = await listCommsLogs({
      limit: parsedLimit,
      vesselId: vesselId || undefined,
    });
    return Response.json({
      configured: isTigerConfigured(),
      logs,
    });
  } catch (error) {
    console.error("Tiger Data log read failed", error);
    return Response.json(
      {
        configured: isTigerConfigured(),
        logs: [],
        error: "Unable to read Tiger Data logs",
      },
      { status: 502 },
    );
  }
}
