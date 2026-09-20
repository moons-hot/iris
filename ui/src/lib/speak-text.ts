/** Cabin speaker briefing: prefer full sentences (up to 5). Never cut mid-sentence. */
const DEFAULT_SPEAK_MAX_SENTENCES = 5;
/** Soft length guide only — a long first sentence is kept whole. */
const DEFAULT_SPEAK_MAX_CHARS = 2000;

/** Prefer a dedicated Speak section when Grok provides one. */
export function extractSpeakSection(markdown: string): string | null {
  const match = markdown.match(
    /##\s*Speak(?:\s+aloud)?\s*\r?\n+([\s\S]*?)(?=\r?\n##\s|$)/i,
  );
  const body = match?.[1]?.trim();
  return body || null;
}

function extractNamedSection(markdown: string, heading: RegExp): string[] {
  const match = markdown.match(
    new RegExp(
      `##\\s*(?:${heading.source})\\s*\\r?\\n+([\\s\\S]*?)(?=\\r?\\n##\\s|$)`,
      "i",
    ),
  );
  const body = match?.[1]?.trim();
  if (!body) return [];
  // Prefer paragraph blocks; fall back to cleaned bullet lines.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) =>
          line
            .replace(/^\s*[-*•]\s+/, "")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .trim(),
        )
        .filter(Boolean)
        .join(" "),
    )
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs;
}

/** Screen sections for station UI (predictions / history / causes). */
export function investigationSections(markdown: string): {
  predictions: string[];
  historicalAnalysis: string[];
  possibleCauses: string[];
} {
  return {
    predictions: extractNamedSection(markdown, /Predictions?/),
    historicalAnalysis: extractNamedSection(markdown, /Historical analysis/),
    possibleCauses: extractNamedSection(
      markdown,
      /What could be causing(?: these symptoms)?|Possible causes|Causal(?:ities)?/,
    ),
  };
}

function stripMarkdownToProse(markdown: string): string {
  return markdown
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\s*\./g, "$1")
    .trim();
}

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Keep spoken replies to a few full sentences.
 * Never hard-slices mid-sentence — only drops later complete sentences.
 * If the first sentence alone is longer than maxChars, it is still kept whole.
 */
export function truncateAtSentence(
  text: string,
  maxChars = DEFAULT_SPEAK_MAX_CHARS,
  maxSentences = DEFAULT_SPEAK_MAX_SENTENCES,
): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;

  const sentences = sentencesOf(cleaned);
  if (sentences.length === 0) return cleaned;

  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    if (count >= maxSentences) break;
    const next = out ? `${out} ${sentence}` : sentence;
    // Soft budget: never add another sentence past the guide, but always keep
    // at least the first complete sentence even if it is long.
    if (out && next.length > maxChars) break;
    out = next;
    count += 1;
  }
  return out;
}

/** Turn investigation markdown into a short spoken briefing for TTS. */
export function investigationToSpeak(
  markdown: string,
  maxChars = DEFAULT_SPEAK_MAX_CHARS,
  maxSentences = DEFAULT_SPEAK_MAX_SENTENCES,
): string {
  const dedicated = extractSpeakSection(markdown);
  const prose = stripMarkdownToProse(dedicated ?? markdown);
  return truncateAtSentence(prose, maxChars, maxSentences);
}

/** Split long spoken replies into TTS-friendly chunks without cutting mid-sentence. */
export function splitSpeakChunks(text: string, maxChars = 280): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = sentencesOf(cleaned);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      // Keep an oversized sentence whole rather than splitting it.
      current = sentence;
      continue;
    }
    if (`${current} ${sentence}`.length <= maxChars) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const COMMS_SUMMARY_MAX = 220;

/**
 * One-line Mission Control brief of what Iris told the astronaut.
 * High-priority replies are prefixed with [ALERT] for ground triage.
 */
export function commsAiResponseSummary(input: {
  speak: string;
  severity?: "high" | "monitor";
  crewReport?: string;
}): string {
  const briefing = (
    truncateAtSentence(input.speak, COMMS_SUMMARY_MAX, 1) ||
    "Iris replied to the crew report."
  ).replace(/\u2014|\u2013/g, "-");
  const crew = input.crewReport?.replace(/\s+/g, " ").trim();
  const crewHint =
    crew && crew.length > 0
      ? `Re: ${crew.length > 72 ? `${crew.slice(0, 69).trimEnd()}…` : crew}. `
      : "";
  const priority =
    input.severity === "high" ? "High priority: " : "Monitoring: ";
  const prefix = input.severity === "high" ? "[ALERT] " : "";
  return `${prefix}${crewHint}${priority}${briefing}`.slice(0, 500);
}
