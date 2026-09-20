import {
  buildTelemetryPacket,
  investigationReply,
  type Snapshot,
} from "@/lib/iris";
import { parseSentAt, recordCommsLog } from "@/lib/tiger";

export const runtime = "nodejs";

const system = `You are Iris, an onboard health investigation assistant for long-duration spaceflight.
You receive a voice report plus astronaut telemetry, spacecraft cabin readings, and space-environment readings.
Do not diagnose or state that one factor caused a condition. Use uncertainty language and compare against the astronaut's personal baseline.
Follow observe -> compare -> identify missing evidence -> collect -> reevaluate.
Return concise markdown with these headings:
- Observed
- Possible concerns to investigate
- Immediate actions
- What would reduce uncertainty next
Preserve citation IDs already in the context.
Use the NASA Human Research Roadmap Risk 95 reference when relevant: https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95.`;

function telemetryBlock(
  telemetry?: Snapshot,
  packet?: ReturnType<typeof buildTelemetryPacket>,
) {
  const lines = packet ?? (telemetry ? buildTelemetryPacket(telemetry) : undefined);
  if (!lines) return "Telemetry packet unavailable";
  return [
    "Astronaut telemetry:",
    ...lines.astronaut.map((line) => `- ${line}`),
    "Spacecraft cabin:",
    ...lines.spacecraft.map((line) => `- ${line}`),
    "Space environment:",
    ...lines.environment.map((line) => `- ${line}`),
    "Peer context:",
    ...lines.peers.map((line) => `- ${line}`),
  ].join("\n");
}

export async function POST(request: Request) {
  const receivedAt = new Date();
  const body = (await request.json()) as {
    message?: string;
    voiceAssessment?: string;
    telemetry?: Snapshot;
    sentAt?: string;
  };
  if (!body.message?.trim()) {
    return Response.json(
      { error: "A symptom report or question is required" },
      { status: 400 },
    );
  }

  const log = await recordCommsLog({
    sentAt: parseSentAt(body.sentAt, receivedAt),
    receivedAt,
    channel: "typed",
    summary: body.message.trim(),
  });

  const fallback = investigationReply(
    body.message,
    body.voiceAssessment,
    body.telemetry,
  );
  const packetText = telemetryBlock(body.telemetry, fallback.telemetry);

  if (!process.env.XAI_API_KEY) {
    return Response.json({ ...fallback, source: "onboard-demo", log });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Voice transcript: ${body.message}
Voice assessment: ${body.voiceAssessment ?? "not available"}

${packetText}

Onboard investigation context:
${fallback.text}

Preserve citation IDs already in the context. Keep possible concerns as investigations, not diagnoses.`,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty Grok investigation reply");
    return Response.json({ ...fallback, text, source: "grok", log });
  } catch {
    return Response.json({
      ...fallback,
      source: "onboard-demo",
      modelWarning:
        "Grok unavailable; used seeded onboard investigation context.",
      log,
    });
  }
}
