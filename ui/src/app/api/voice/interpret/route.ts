import { NextResponse } from "next/server";
import { z } from "zod";

import { summarizeScopedContext } from "@/server/grok/generate";
import { extractIntent } from "@/server/grok/intent";
import {
  createClinicalHandoff,
  createEngineeringDelegation,
} from "@/server/iris/actions";
import { SessionInvalidError, buildLens } from "@/server/iris/context";
import { buildPatientTimeline } from "@/server/iris/patient-view";
import { getStore } from "@/server/store";

const bodySchema = z.object({
  sessionId: z.string().min(3),
  patientId: z.string().min(2),
  utterance: z.string().min(2),
});

/**
 * The tool dispatch layer.
 *
 * Grok decides which tool fits the utterance. Each tool then runs behind the
 * policy engine, so a mis-classified intent cannot widen access - at worst it
 * produces the wrong correctly-scoped view.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { sessionId, patientId, utterance } = parsed.data;

  try {
    const intent = await extractIntent(utterance);
    const store = getStore();

    if (intent.action === "request_break_glass") {
      // Requires an explicit reason and a physical press; the client drives that.
      return NextResponse.json({
        intent,
        tool: "requestBreakGlass",
        requiresBreakGlass: true,
        message: "Confirm emergency access on your CareKey, then record the reason.",
      });
    }

    if (intent.action === "show_access_history") {
      const timeline = await buildPatientTimeline(patientId, 10);
      return NextResponse.json({
        intent,
        tool: "showAccessHistory",
        timeline,
      });
    }

    if (intent.action === "create_handoff") {
      const specialty = detectSpecialty(utterance);
      const result = await createClinicalHandoff({
        sessionId,
        patientId,
        specialty,
      });
      return NextResponse.json({
        intent,
        tool: "createClinicalHandoff",
        action: result.action,
        included: result.included,
        excluded: result.excluded,
        lens: result.lens,
      });
    }

    if (intent.action === "create_engineering_delegation") {
      const minutes = detectMinutes(utterance);
      const encounters = await store.listEncounters(patientId);
      const delegation = await createEngineeringDelegation({
        sessionId,
        patientId,
        encounterId: encounters[0]?.id ?? null,
        minutes,
        reason: utterance,
      });
      return NextResponse.json({
        intent,
        tool: "createEngineeringDelegation",
        delegation,
      });
    }

    await store.updateSession(sessionId, {
      purpose: intent.purpose,
      task: intent.task,
    });

    const lens = await buildLens({
      sessionId,
      patientId,
      purpose: intent.purpose,
      task: intent.task,
    });
    const answer = await summarizeScopedContext(lens, utterance);

    return NextResponse.json({
      intent,
      tool: "requestPatientContext",
      lens,
      answer: answer.text,
      answerSource: answer.source,
    });
  } catch (error) {
    if (error instanceof SessionInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}

function detectSpecialty(utterance: string): string {
  const text = utterance.toLowerCase();
  const specialties = [
    "cardiology",
    "neurology",
    "endocrinology",
    "psychiatry",
    "nephrology",
    "oncology",
    "surgery",
  ];
  const found = specialties.find((specialty) => text.includes(specialty));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : "Cardiology";
}

function detectMinutes(utterance: string): number {
  const match = /(\d{1,3})\s*(minute|min)/i.exec(utterance);
  const minutes = match?.[1] ? Number.parseInt(match[1], 10) : 30;
  return Math.min(Math.max(minutes, 5), 120);
}
