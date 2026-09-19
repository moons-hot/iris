export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  if (!body.text?.trim())
    return Response.json({ error: "text is required" }, { status: 400 });

  if (!process.env.XAI_API_KEY) {
    return Response.json({ text: body.text, demoFallback: true });
  }

  const response = await fetch("https://api.x.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-voice",
      input: body.text,
      voice: "ara",
    }),
  });
  if (!response.ok)
    return Response.json(
      { error: "Grok Voice speech failed" },
      { status: 502 },
    );
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
    },
  });
}
