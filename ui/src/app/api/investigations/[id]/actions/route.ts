import { generateText } from "ai";
import { xai } from "@ai-sdk/xai";

import { investigationReply } from "@/lib/iris";

export const runtime = "nodejs";

const system = `You are Iris, an onboard health investigation assistant for long-duration spaceflight.
Do not diagnose or state that one factor caused a condition. Use uncertainty language and compare against the astronaut's personal baseline.
Follow observe -> compare -> identify missing evidence -> collect -> reevaluate. Explain supporting and contradicting evidence.
Use the NASA Human Research Roadmap Risk 95 reference when relevant: https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95.
Return concise markdown with Observed, Working interpretation, and Next evidence headings.`;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    voiceAssessment?: string;
  };
  if (!body.message?.trim()) {
    return Response.json(
      { error: "A symptom report or question is required" },
      { status: 400 },
    );
  }

  const fallback = investigationReply(body.message, body.voiceAssessment);
  if (!process.env.XAI_API_KEY)
    return Response.json({ ...fallback, source: "onboard-demo" });

  try {
    const result = await generateText({
      model: xai("grok-4-1-fast-reasoning"),
      system,
      prompt: `Astronaut report: ${body.message}\nVoice assessment: ${body.voiceAssessment ?? "not available"}\n\nOnboard investigation context:\n${fallback.text}\n\nPreserve citation IDs already in the context.`,
    });
    return Response.json({ ...fallback, text: result.text, source: "grok" });
  } catch {
    return Response.json({
      ...fallback,
      source: "onboard-demo",
      modelWarning:
        "Grok unavailable; used seeded onboard investigation context.",
    });
  }
}
