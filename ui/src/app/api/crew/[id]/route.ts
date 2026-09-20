import { getSnapshot } from "@/lib/iris";

export const runtime = "nodejs";

export function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return params.then(({ id }) => {
    const snapshot = getSnapshot();
    if (id === "A01") {
      return Response.json({
        crew: snapshot.astronaut,
        vitals: snapshot.vitals,
      });
    }
    const peer = snapshot.peers.find((crewMember) => crewMember.id === id);
    if (!peer)
      return Response.json({ error: "Crew member not found" }, { status: 404 });
    return Response.json({
      crew: peer,
      vitals: [
        {
          label: "Heart rate",
          value: peer.heartRate,
          unit: "bpm",
          baseline: peer.heartRate,
          direction: "stable",
        },
      ],
    });
  });
}
