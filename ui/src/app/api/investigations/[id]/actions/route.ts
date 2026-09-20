import {
  buildTelemetryPacket,
  investigationReply,
  type Snapshot,
} from "@/lib/iris";
import {
  commsAiResponseSummary,
  investigationToSpeak,
} from "@/lib/speak-text";
import { parseSentAt, recordCommsLog } from "@/lib/tiger";

export const runtime = "nodejs";

const system = `You are Iris, an onboard health investigation assistant for long-duration spaceflight.
You receive a voice report plus astronaut telemetry, spacecraft cabin readings, space-environment readings, and the active mission event mode (mild symptoms watch vs dire watch, including solar-flare / radiation context when present).
Do not diagnose or claim one factor caused a condition. Use uncertainty language and compare against the astronaut's personal baseline.
Interpret the transcript with the metrics — do not dump a raw vitals list as the main answer.

Return markdown with ONLY these headings, in this order:
- Predictions
- What could be causing these symptoms
- Historical analysis
- Speak aloud

Write each screen section as 1–2 short prose paragraphs (not bullet lists). Keep each section scannable and specific.

## Predictions
What may happen next if this pattern continues (monitor vs escalate). Factor in whether the station is in a mild or dire event window and any active solar-flare / radiation context.

## What could be causing these symptoms
Name the critical metrics that are off baseline or elevated right now (only the ones that matter for this report). Explicitly relate each chosen metric to the astronaut's stated symptoms or question — e.g. how cabin CO₂, SpO₂, heart rate, blood pressure, hull radiation, or flare status could connect to what they said. Stay tentative (possible, consistent with, warrants checking).

## Historical analysis
Close with an explanation of the historical / OSDR-style testing you used from the onboard evidence packet (citation IDs such as EVID-OSDR-014, EVID-HRR-095). Say how the current report and event context match — or do not match — those prior cases. Tie that match/mismatch to the live event mode (mild vs dire) and space-weather signals such as solar flares when relevant. Do not invent new study IDs.

## Speak aloud
What the crew hears on the laptop speakers (at most 5 short sentences, under ~620 characters). Interpret — do NOT recite every number. Cover: what you heard; the most important symptom–metric links; whether history matches this event; mild vs dire / flare context; one next check. Calm tone. No markdown, no bullets, no citation IDs.

Preserve citation IDs in the non-speak sections only.
Use the NASA Human Research Roadmap Risk 95 reference when relevant: https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95.`;

function telemetryBlock(
  telemetry?: Snapshot,
  packet?: ReturnType<typeof buildTelemetryPacket>,
) {
  const lines =
    packet ?? (telemetry ? buildTelemetryPacket(telemetry) : undefined);
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

async function logCrewAndIris(input: {
  channel: "typed" | "voice";
  crewReport: string;
  speak: string;
  severity: "high" | "monitor";
  sentAt: Date;
  receivedAt: Date;
  vesselId: string;
}) {
  // Voice uplink already stamps /api/voice — don't double-log the crew report.
  const uplink =
    input.channel === "voice"
      ? null
      : await recordCommsLog({
          sentAt: input.sentAt,
          receivedAt: input.receivedAt,
          channel: "typed",
          direction: "uplink",
          vesselId: input.vesselId,
          summary: `Crew report: ${input.crewReport}`.slice(0, 500),
        });

  const downlink = await recordCommsLog({
    sentAt: new Date(),
    receivedAt: new Date(),
    channel: "speak",
    direction: "downlink",
    vesselId: input.vesselId,
    summary: commsAiResponseSummary({
      speak: input.speak,
      severity: input.severity,
      crewReport: input.crewReport,
    }),
  });

  return { uplink, downlink };
}

export async function POST(request: Request) {
  const receivedAt = new Date();
  const body = (await request.json()) as {
    message?: string;
    voiceAssessment?: string;
    telemetry?: Snapshot;
    sentAt?: string;
    vesselId?: string;
    channel?: "typed" | "voice";
  };
  if (!body.message?.trim()) {
    return Response.json(
      { error: "A symptom report or question is required" },
      { status: 400 },
    );
  }

  const channel = body.channel === "voice" ? "voice" : "typed";
  const vesselId = body.vesselId ?? "asteria";
  const sentAt = parseSentAt(body.sentAt, receivedAt);
  const crewReport = body.message.trim();

  const fallback = investigationReply(
    body.message,
    body.voiceAssessment,
    body.telemetry,
  );
  const packetText = telemetryBlock(body.telemetry, fallback.telemetry);

  async function finish(payload: {
    text: string;
    speak: string;
    source: "grok" | "onboard-demo";
    modelWarning?: string;
  }) {
    const speak = payload.speak || investigationToSpeak(payload.text);
    const severity = fallback.severity === "high" ? "high" : "monitor";
    const log = await logCrewAndIris({
      channel,
      crewReport,
      speak,
      severity,
      sentAt,
      receivedAt,
      vesselId,
    });
    return Response.json({
      ...fallback,
      text: payload.text,
      speak,
      source: payload.source,
      modelWarning: payload.modelWarning,
      log,
    });
  }

  if (!process.env.XAI_API_KEY) {
    return finish({
      text: fallback.text,
      speak: investigationToSpeak(fallback.text),
      source: "onboard-demo",
    });
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
Active event mode: ${body.telemetry?.scenario ?? "unknown"} (mild = symptom watch, dire = high-priority / flare-capable window)

${packetText}

Onboard investigation context:
${fallback.text}

Call out the critical metrics that matter for this report and how they relate to the astronaut's words. End Historical analysis by stating whether OSDR/HRR evidence matches this event or not. Keep possible concerns as investigations, not diagnoses. Preserve citation IDs already in the context.`,
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
    const speak = investigationToSpeak(text);
    console.log("[iris investigate / speak]", speak.slice(0, 240));
    return finish({ text, speak, source: "grok" });
  } catch {
    return finish({
      text: fallback.text,
      speak: investigationToSpeak(fallback.text),
      source: "onboard-demo",
      modelWarning:
        "Grok unavailable; used seeded onboard investigation context.",
    });
  }
}
