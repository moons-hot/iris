/** Cabin speaker briefing: up to five sentences, not a one-liner ack. */
const DEFAULT_SPEAK_MAX_SENTENCES = 5;
const DEFAULT_SPEAK_MAX_CHARS = 620;

/** Prefer a dedicated Speak section when Grok provides one. */
export function extractSpeakSection(markdown: string): string | null {
  const match = markdown.match(
    /##\s*Speak(?:\s+aloud)?\s*\r?\n+([\s\S]*?)(?=\r?\n##\s|$)/i,
  );
  const body = match?.[1]?.trim();
  return body || null;
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

/** Keep spoken replies to a few sentences without cutting mid-thought when possible. */
export function truncateAtSentence(
  text: string,
  maxChars = DEFAULT_SPEAK_MAX_CHARS,
  maxSentences = DEFAULT_SPEAK_MAX_SENTENCES,
): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;

  const sentences = sentencesOf(cleaned);
  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    if (count >= maxSentences) break;
    const next = out ? `${out} ${sentence}` : sentence;
    if (out && next.length > maxChars) break;
    out = next;
    count += 1;
  }
  return out || cleaned.slice(0, maxChars).trim();
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

/** Split long spoken replies into TTS-friendly chunks without cutting mid-sentence when possible. */
export function splitSpeakChunks(text: string, maxChars = 280): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = sentencesOf(cleaned);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
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
