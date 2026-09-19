import { isTigerConfigured, listCommsLogs } from "@/lib/tiger";

export const runtime = "nodejs";

export async function GET() {
  try {
    const logs = await listCommsLogs();
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
