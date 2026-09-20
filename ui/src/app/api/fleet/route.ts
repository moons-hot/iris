import { DEFAULT_VESSEL_ID, getFleet } from "@/lib/iris";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? DEFAULT_VESSEL_ID;
  return Response.json(getFleet(id));
}
