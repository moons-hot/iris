import { grokChat, grokConfigured } from "@/server/grok/client";
import type { LensResult } from "@/server/iris/context";
import { modelContext } from "@/server/iris/context";

/**
 * Guard rail: the model only ever receives values the policy engine released for
 * this request. Anything else throws rather than silently leaking.
 */
function assertScoped(lens: LensResult): Array<{
  label: string;
  value: string;
  reduced: boolean;
}> {
  const context = modelContext(lens);
  const leaked = lens.fragments.filter(
    (fragment) => fragment.decision === "deny" && fragment.value !== null,
  );
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to call the model: ${leaked.length} restricted fragment(s) carry plaintext`,
    );
  }
  return context;
}

function contextBlock(
  context: Array<{ label: string; value: string; reduced: boolean }>,
): string {
  return context
    .map(
      (entry) =>
        `${entry.label}${entry.reduced ? " (reduced for this purpose)" : ""}: ${entry.value}`,
    )
    .join("\n");
}

export async function summarizeScopedContext(
  lens: LensResult,
  question: string,
): Promise<{ text: string; source: "grok" | "template" }> {
  const context = assertScoped(lens);

  if (grokConfigured()) {
    const answer = await grokChat([
      {
        role: "system",
        content: `You are Iris, a clinical context assistant. Answer using ONLY the context provided.

The context has already been filtered by a policy engine for the clinician's current purpose: ${lens.purposeLabel}.
Some fields were withheld. Do not guess at them, do not ask for them, and never invent clinical detail.
Be brief: 3-5 short bullet points a clinician can read at a glance. Note anything clinically urgent first.`,
      },
      {
        role: "user",
        content: `Purpose: ${lens.purposeLabel}\nTask: ${lens.task ?? "not specified"}\nQuestion: ${question}\n\nAuthorized context:\n${contextBlock(context)}`,
      },
    ]);
    if (answer) return { text: answer.trim(), source: "grok" };
  }

  // Deterministic fallback so the flow still completes with no model available.
  const lines = context.map((entry) => `- ${entry.label}: ${entry.value}`);
  return {
    text: [
      `Scoped context for ${lens.purposeLabel}${lens.task ? ` (${lens.task.replace(/_/g, " ")})` : ""}:`,
      ...lines,
      `${lens.restrictedCount} field(s) withheld by policy.`,
    ].join("\n"),
    source: "template",
  };
}

export interface HandoffDraft {
  specialty: string;
  sections: Array<{ heading: string; body: string }>;
  source: "grok" | "template";
}

export async function generateHandoff(
  lens: LensResult,
  specialty: string,
  clinicianContext?: string,
): Promise<HandoffDraft> {
  const context = assertScoped(lens);
  const notes = clinicianContext?.trim();

  if (grokConfigured()) {
    const raw = await grokChat(
      [
        {
          role: "system",
          content: `You write concise clinical handoffs from pre-authorized context only.

Return JSON: {"sections":[{"heading":string,"body":string}]}
Use 4-6 sections. Typical headings: Presenting complaint, Relevant history, Medications, Allergies, Relevant results, Recommended follow-up.
Use only the supplied context. If something is absent, omit the section rather than inventing it.
When clinician notes are provided, weave them into the appropriate sections without contradicting authorized data.`,
        },
        {
          role: "user",
          content: `Specialty: ${specialty}\nPurpose: ${lens.purposeLabel}\n\n${
            notes
              ? `Clinician summary (spoken or typed — prioritize if consistent with authorized context):\n${notes}\n\n`
              : ""
          }Authorized context:\n${contextBlock(context)}`,
        },
      ],
      { json: true },
    );

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          sections?: Array<{ heading?: string; body?: string }>;
        };
        const sections = (parsed.sections ?? [])
          .filter((section) => section.heading && section.body)
          .map((section) => ({
            heading: section.heading!,
            body: section.body!,
          }));
        if (sections.length > 0) {
          return { specialty, sections, source: "grok" };
        }
      } catch {
        // fall through to the template
      }
    }
  }

  return {
    specialty,
    sections: [
      ...(notes
        ? [{ heading: "Referring clinician summary", body: notes }]
        : []),
      ...context.map((entry) => ({
        heading: entry.label,
        body: entry.value,
      })),
    ],
    source: "template",
  };
}

/**
 * Turns raw dictation into typed fragments. Classification is suggested by the
 * model but every field is written through the same encrypted fragment path.
 */
export interface ExtractedFragment {
  fragmentType: string;
  label: string;
  value: string;
}

export async function extractEncounterFragments(
  transcript: string,
): Promise<{ fragments: ExtractedFragment[]; source: "grok" | "template" }> {
  if (grokConfigured()) {
    const raw = await grokChat(
      [
        {
          role: "system",
          content: `Extract structured clinical fields from a visit transcript.

Return JSON: {"fragments":[{"fragment_type":string,"label":string,"value":string}]}
fragment_type must be one of: visit_reason, vitals, allergies, medications, diagnoses, labs, procedures, clinical_note, cardiac_history.
Keep values short and factual. Do not invent anything that was not said.`,
        },
        { role: "user", content: transcript },
      ],
      { json: true },
    );
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          fragments?: Array<{
            fragment_type?: string;
            label?: string;
            value?: string;
          }>;
        };
        const fragments = (parsed.fragments ?? [])
          .filter((entry) => entry.fragment_type && entry.value)
          .map((entry) => ({
            fragmentType: entry.fragment_type!,
            label: entry.label ?? entry.fragment_type!,
            value: entry.value!,
          }));
        if (fragments.length > 0) return { fragments, source: "grok" };
      } catch {
        // fall through
      }
    }
  }

  return {
    fragments: [
      {
        fragmentType: "clinical_note",
        label: "Dictated note",
        value: transcript.trim(),
      },
    ],
    source: "template",
  };
}
