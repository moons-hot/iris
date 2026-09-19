import { grokChat, grokConfigured } from "@/server/grok/client";

export interface DraftNoteResult {
  note: string;
  source: "grok" | "template";
}

/**
 * Turns visit audio transcription into a short progress note. The transcript
 * itself is not persisted; only the drafted note moves forward to redaction.
 */
export async function draftNoteFromTranscript(
  transcript: string,
): Promise<DraftNoteResult> {
  const trimmed = transcript.trim();
  if (trimmed.length < 8) {
    return { note: trimmed, source: "template" };
  }

  if (grokConfigured()) {
    const answer = await grokChat(
      [
        {
          role: "system",
          content: `You draft a concise clinical progress note from a visit conversation transcript.

Write 4-8 sentences in plain clinical prose: presenting concern, relevant history mentioned, exam or plan discussed, and follow-up if any.
Do not invent facts that were not said. If the transcript is thin, say only what was clearly stated.
No bullet lists unless the speaker used them.`,
        },
        { role: "user", content: trimmed },
      ],
      { temperature: 0.25 },
    );
    if (answer?.trim()) {
      return { note: answer.trim(), source: "grok" };
    }
  }

  return {
    note: `Visit documentation (from dictation):\n${trimmed}`,
    source: "template",
  };
}
