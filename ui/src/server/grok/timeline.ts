import { grokChat, grokConfigured } from "@/server/grok/client";

/**
 * Everything the summarizer is allowed to know about one access.
 *
 * Note what is missing: no field values, and not the reason a clinician typed
 * when they broke glass. Categories like "your medications" are already the
 * patient-facing labels, so the model paraphrases a description of an access,
 * never the record itself. The stated reason is shown verbatim next to the
 * sentence instead, because a paraphrased reason is a changed reason.
 */
export interface TimelineFacts {
  id: string;
  time: string;
  actorName: string;
  department: string;
  purposeText: string;
  viewed: string[];
  reduced: string[];
  withheld: number;
  kind: "normal" | "emergency" | "system";
}

/** Reads out a handful of categories; past that, a count is kinder than a list. */
function list(items: string[], cap = 4): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length > cap) {
    return `${items.slice(0, cap).join(", ")} and ${items.length - cap} more`;
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)!}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Runs when Grok is unavailable, and as the first answer while it is working. */
export function templateSummary(facts: TimelineFacts): string {
  const who = facts.department
    ? `${facts.actorName} in ${facts.department}`
    : facts.actorName;

  const parts: string[] = [];
  if (facts.kind === "emergency") {
    parts.push(`${who} opened your full record under emergency access.`);
  } else if (facts.viewed.length > 0) {
    // The purpose leads, because it is the part a patient is actually asking
    // about when they open this screen.
    parts.push(`${facts.purposeText}: ${who} looked at ${list(facts.viewed)}.`);
  } else {
    parts.push(`${facts.purposeText}: ${who} opened your record.`);
  }

  if (facts.reduced.length > 0) {
    parts.push(
      `${sentenceCase(list(facts.reduced))} appeared only in a reduced form.`,
    );
  }
  if (facts.withheld > 0) {
    parts.push(
      `${facts.withheld} other part${facts.withheld === 1 ? "" : "s"} of your record stayed closed.`,
    );
  }
  return parts.join(" ");
}

interface SummaryCache {
  byEventId: Map<string, string>;
  inFlight: Set<string>;
}

// Survives hot reloads, and survives the 5s poll on /patient: an access that
// has already been described never costs a second model call.
const globalForSummaries = globalThis as unknown as {
  irisTimelineSummaries?: SummaryCache;
};

function cache(): SummaryCache {
  return (globalForSummaries.irisTimelineSummaries ??= {
    byEventId: new Map(),
    inFlight: new Set(),
  });
}

const MAX_CACHED = 2_000;
const MAX_PER_CALL = 40;

function remember(eventId: string, summary: string): void {
  const store = cache();
  if (store.byEventId.size >= MAX_CACHED) {
    const oldest = store.byEventId.keys().next().value;
    if (oldest !== undefined) store.byEventId.delete(oldest);
  }
  store.byEventId.set(eventId, summary);
}

/**
 * Rewrites each access as one plain sentence. Returns the same entries with
 * `summary` filled in; a failed or absent model just leaves the template.
 */
export async function summarizeTimeline<T extends TimelineFacts>(
  entries: T[],
): Promise<Array<T & { summary: string }>> {
  const store = cache();

  const pending = entries
    .filter(
      (entry) =>
        !store.byEventId.has(entry.id) && !store.inFlight.has(entry.id),
    )
    .slice(0, MAX_PER_CALL);

  if (grokConfigured() && pending.length > 0) {
    for (const entry of pending) store.inFlight.add(entry.id);
    try {
      const raw = await grokChat(
        [
          {
            role: "system",
            content: `You explain medical record access to the patient whose record it is.

Return JSON: {"summaries":{"<id>":"<one sentence>"}}
One sentence per id, under 25 words, plain English, second person ("your"). Say who opened the record, why, and what kind of information they saw. Never add clinical detail, never speculate about the patient's health, never reassure or alarm. If information was withheld or reduced, say so plainly.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              accesses: pending.map((entry) => ({
                id: entry.id,
                who: entry.actorName,
                department: entry.department,
                why: entry.purposeText,
                saw: entry.viewed,
                seenReduced: entry.reduced,
                withheldCount: entry.withheld,
                emergency: entry.kind === "emergency",
              })),
            }),
          },
        ],
        { json: true },
      );

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            summaries?: Record<string, unknown>;
          };
          for (const [id, sentence] of Object.entries(parsed.summaries ?? {})) {
            if (typeof sentence === "string" && sentence.trim()) {
              remember(id, sentence.trim());
            }
          }
        } catch {
          // Leave the templates in place.
        }
      }
    } finally {
      for (const entry of pending) store.inFlight.delete(entry.id);
    }
  }

  return entries.map((entry) => ({
    ...entry,
    summary: store.byEventId.get(entry.id) ?? templateSummary(entry),
  }));
}
