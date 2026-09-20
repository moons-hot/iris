export const runtime = "nodejs";

export async function POST(request: Request) {
    const body = (await request.json()) as { text?: string };
    if (!body.text?.trim())
        return Response.json({ error: "text is required" }, { status: 400 });

    console.log("[iris speak / bot says]", body.text.trim());

    if (!process.env.XAI_API_KEY) {
        return Response.json({ text: body.text, demoFallback: true });
    }

    // https://docs.x.ai/docs/guides/voice — POST /v1/tts
    // ara = warmer/calmer than eve; speed >1 shortens cabin play time;
    // pcm @ 16 kHz matches the ESP path (no MP3 decode scratch).
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
            speed: 1.2,
            output_format: {
                codec: "pcm",
                sample_rate: 16000,
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
            "Content-Type": response.headers.get("Content-Type") ?? "audio/pcm",
        },
    });
}
