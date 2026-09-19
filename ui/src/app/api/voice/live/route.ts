import { transcribeWithGrokVoice } from "@/lib/grok-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "Provide a live audio chunk" }, { status: 400 });
  }

  const result = await transcribeWithGrokVoice(audio);
  return Response.json({
    transcript: result.transcript,
    source: result.source,
    model: result.model,
    live: result.source === "grok-voice",
    error: result.error,
  });
}
