import { generateText, isStepCount } from "ai";
import { createXai } from "@ai-sdk/xai";

import type { IrisPipeline, InterpretResponse } from "@/lib/pipeline";
import { policyFromLens } from "@/lib/pipeline";
import { grokConfigured, grokModel } from "@/server/grok/client";
import { summarizeScopedContext } from "@/server/grok/generate";
import { keywordIntent, type Intent } from "@/server/grok/intent";
import { bindIrisTools } from "@/server/ai/tools";
import type { AgentStash } from "@/server/ai/stash";
import {
  createClinicalHandoff,
  createEngineeringDelegation,
} from "@/server/iris/actions";
import { SessionInvalidError, buildLens } from "@/server/iris/context";
import { buildPatientTimeline } from "@/server/iris/patient-view";
import { getStore } from "@/server/store";

const SYSTEM_PROMPT = `You are Iris, a clinical context assistant for a treating clinician.

You do not authorize access. A deterministic policy engine does that.

Workflow for clinical questions about this patient:
1. Infer purpose (usually treatment) and the clinical situation.
2. Call searchPopulationContext when similar synthetic contexts would help you decide which fields to request. Treat the result as relevance only. Always describe it as synthetic clinical contexts — never as evidence of real doctors, guidelines, or this patient's history.
3. Call requestPatientContext with purpose plus the fragment types you need. That tool is the authorization boundary. Answer only from authorizedContext. If a field is withheld, say so and do not invent it.
4. Never claim population frequencies allowed or denied a field.

Other tools:
- requestBreakGlass for emergency override / break glass. Call only that tool. Do not fetch patient context in the same turn.
- createClinicalHandoff for specialist handoff/referral.
- createEngineeringDelegation when asked to grant engineering/debug access.
- showAccessHistory when asked who accessed the record.

If Snowflake population search is unavailable, continue with requestPatientContext.`;

export async function interpretClinicianUtterance(input: {
  sessionId: string;
  patientId: string;
  utterance: string;
}): Promise<InterpretResponse> {
  const fallbackIntent = keywordIntent(input.utterance);

  if (grokConfigured()) {
    try {
      const agentResult = await runAgent(input, fallbackIntent);
      if (agentResult) return agentResult;
    } catch (error) {
      if (error instanceof SessionInvalidError) throw error;
      console.warn("Iris agent failed, using keyword fallback", error);
    }
  }

  return runDeterministicInterpret(input, fallbackIntent);
}

async function runAgent(
  input: { sessionId: string; patientId: string; utterance: string },
  fallbackIntent: Intent,
): Promise<InterpretResponse | null> {
  const stash: AgentStash = { utterance: input.utterance };
  const tools = bindIrisTools(stash, input.sessionId, input.patientId);
  const xai = createXai({ apiKey: process.env.GROK_API_KEY });

  const result = await generateText({
    model: xai(grokModel()),
    tools,
    stopWhen: isStepCount(8),
    temperature: 0.2,
    timeout: 40_000,
    system: SYSTEM_PROMPT,
    prompt: input.utterance,
  });

  if (stash.breakGlass) {
    return {
      intent: {
        ...fallbackIntent,
        action: "request_break_glass",
        purpose: "emergency_treatment",
        source: "grok",
      },
      tool: "requestBreakGlass",
      requiresBreakGlass: true,
      message: stash.breakGlass.message,
      pipeline: buildPipeline(stash, fallbackIntent, result.text),
    };
  }

  if (stash.handoff) {
    return {
      intent: {
        ...fallbackIntent,
        action: "create_handoff",
        purpose: "treatment",
        source: "grok",
      },
      tool: "createClinicalHandoff",
      action: stash.handoff.action,
      included: stash.handoff.included,
      excluded: stash.handoff.excluded,
      lens: stash.handoff.lens,
      pipeline: buildPipeline(stash, fallbackIntent, result.text),
    };
  }

  if (stash.delegation) {
    return {
      intent: {
        ...fallbackIntent,
        action: "create_engineering_delegation",
        purpose: "engineering_debug",
        source: "grok",
      },
      tool: "createEngineeringDelegation",
      delegation: stash.delegation,
      pipeline: buildPipeline(stash, fallbackIntent, result.text),
    };
  }

  if (stash.timeline) {
    return {
      intent: {
        ...fallbackIntent,
        action: "show_access_history",
        source: "grok",
      },
      tool: "showAccessHistory",
      timeline: stash.timeline,
      pipeline: buildPipeline(stash, fallbackIntent, result.text),
    };
  }

  if (stash.lens) {
    const intent: Intent = {
      action: "request_context",
      purpose: stash.purpose ?? fallbackIntent.purpose,
      task: stash.task ?? fallbackIntent.task,
      requestedContext:
        stash.requestedContext ?? fallbackIntent.requestedContext,
      source: "grok",
      utterance: input.utterance,
    };
    let answer = result.text.trim();
    let answerSource = "agent";
    if (!answer) {
      const fallbackAnswer = await summarizeScopedContext(
        stash.lens,
        input.utterance,
      );
      answer = fallbackAnswer.text;
      answerSource = fallbackAnswer.source;
    }
    return {
      intent,
      tool: "requestPatientContext",
      lens: stash.lens,
      answer,
      answerSource,
      pipeline: buildPipeline(stash, intent, answer),
    };
  }

  return null;
}

export async function runDeterministicInterpret(
  input: { sessionId: string; patientId: string; utterance: string },
  intent: Intent = keywordIntent(input.utterance),
): Promise<InterpretResponse> {
  const store = getStore();

  if (intent.action === "request_break_glass") {
    return {
      intent,
      tool: "requestBreakGlass",
      requiresBreakGlass: true,
      message:
        "Confirm emergency access on your CareKey, then record the reason.",
      pipeline: idlePipeline(intent, "skipped"),
    };
  }

  if (intent.action === "show_access_history") {
    const timeline = await buildPatientTimeline(input.patientId, 10);
    return { intent, tool: "showAccessHistory", timeline };
  }

  if (intent.action === "create_handoff") {
    const specialty = detectSpecialty(input.utterance);
    const result = await createClinicalHandoff({
      sessionId: input.sessionId,
      patientId: input.patientId,
      specialty,
    });
    return {
      intent,
      tool: "createClinicalHandoff",
      action: result.action,
      included: result.included,
      excluded: result.excluded,
      lens: result.lens,
    };
  }

  if (intent.action === "create_engineering_delegation") {
    const minutes = detectMinutes(input.utterance);
    const encounters = await store.listEncounters(input.patientId);
    const delegation = await createEngineeringDelegation({
      sessionId: input.sessionId,
      patientId: input.patientId,
      encounterId: encounters[0]?.id ?? null,
      minutes,
      reason: input.utterance,
    });
    return { intent, tool: "createEngineeringDelegation", delegation };
  }

  await store.updateSession(input.sessionId, {
    purpose: intent.purpose,
    task: intent.task,
  });

  const lens = await buildLens({
    sessionId: input.sessionId,
    patientId: input.patientId,
    purpose: intent.purpose,
    task: intent.task,
    requestedTypes: intent.requestedContext,
  });
  const answer = await summarizeScopedContext(lens, input.utterance);

  return {
    intent,
    tool: "requestPatientContext",
    lens,
    answer: answer.text,
    answerSource: answer.source,
    pipeline: {
      clinicalSituation: input.utterance,
      purpose: intent.purpose,
      task: intent.task,
      steps: [
        { id: "intent", label: "Understanding intent", status: "complete" },
        { id: "population", label: "Searching Snowflake", status: "skipped" },
        { id: "policy", label: "Applying Iris policy", status: "complete" },
        { id: "answer", label: "Answer", status: "complete" },
      ],
      population: null,
      policy: policyFromLens(intent.requestedContext, lens.fragments),
    },
  };
}

function buildPipeline(
  stash: AgentStash,
  intent: Intent,
  answer?: string | null,
): IrisPipeline {
  const population = stash.population ?? null;
  const populationStatus = population?.status !== "ok" ? "skipped" : "complete";
  const policyStatus = stash.lens ? "complete" : "skipped";
  const answerStatus =
    answer && answer.trim().length > 0 ? "complete" : policyStatus;

  return {
    clinicalSituation: stash.clinicalSituation ?? intent.utterance,
    purpose: stash.purpose ?? intent.purpose,
    task: stash.task ?? intent.task,
    steps: [
      { id: "intent", label: "Understanding intent", status: "complete" },
      {
        id: "population",
        label: "Searching Snowflake",
        status: populationStatus,
      },
      { id: "policy", label: "Applying Iris policy", status: policyStatus },
      { id: "answer", label: "Answer", status: answerStatus },
    ],
    population,
    policy: stash.policy ?? [],
  };
}

function idlePipeline(
  intent: Intent,
  populationStatus: IrisPipeline["steps"][number]["status"],
): IrisPipeline {
  return {
    clinicalSituation: intent.utterance,
    purpose: intent.purpose,
    task: intent.task,
    steps: [
      { id: "intent", label: "Understanding intent", status: "complete" },
      {
        id: "population",
        label: "Searching Snowflake",
        status: populationStatus,
      },
      { id: "policy", label: "Applying Iris policy", status: "skipped" },
      { id: "answer", label: "Answer", status: "skipped" },
    ],
    population: null,
    policy: [],
  };
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
