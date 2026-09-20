export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  if (!body.text?.trim())
    return Response.json({ error: "text is required" }, { status: 400 });

  console.log("[iris speak / bot says]", body.text.trim());

  if (!process.env.XAI_API_KEY) {
    return Response.json({ text: body.text, demoFallback: true });
  }

  // Laptop speakers: MP3 is faster to play in the browser than ESP PCM serial.
  // https://docs.x.ai/docs/guides/voice — POST /v1/tts
  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: body.text,
      voice_id: "ara",
      language: "en",
      speed: 1.15,
      output_format: {
        codec: "mp3",
        sample_rate: 24000,
        bit_rate: 128000,
      },
    }),
  });
  if (!response.ok)
    return Response.json(
      {
        error: "Grok Voice speech failed",
        detail: await response.text(),
      },
      { status: 502 },
    );
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
    },
  });
}
