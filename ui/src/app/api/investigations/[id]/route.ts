export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return Response.json({
    id,
    status: "active",
    astronautId: "A01",
    message:
      "Investigation state is reconstructed from the onboard context bundle for this hackathon demo.",
  });
}
