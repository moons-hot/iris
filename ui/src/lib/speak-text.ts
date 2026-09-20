/** Keep ESP TTS short: less serial PCM = faster, less scratchy play. */
const DEFAULT_SPEAK_MAX = 140;

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

/** Keep spoken replies short enough for ESP TTS + serial playback. */
export function truncateAtSentence(text: string, maxChars = DEFAULT_SPEAK_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length <= maxChars) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  let out = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
  }
  return out || cleaned.slice(0, maxChars).trim();
}

/** Turn investigation markdown into a short spoken line for TTS. */
export function investigationToSpeak(
  markdown: string,
  maxChars = DEFAULT_SPEAK_MAX,
): string {
  const dedicated = extractSpeakSection(markdown);
  const prose = stripMarkdownToProse(dedicated ?? markdown);
  return truncateAtSentence(prose, maxChars);
}

/** Split long spoken replies into TTS-friendly chunks without cutting mid-sentence when possible. */
export function splitSpeakChunks(text: string, maxChars = 200): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
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
