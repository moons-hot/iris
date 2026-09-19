import { grokChat, grokConfigured } from "@/server/grok/client";

export interface RedactionResult {
  redacted: string;
  /** Plain-language categories removed, not the actual values. */
  removed: string[];
  source: "grok" | "template";
}

const PHONE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

function templateRedact(text: string): RedactionResult {
  const removed: string[] = [];
  let redacted = text;

  if (PHONE.test(text)) {
    removed.push("phone number");
    redacted = redacted.replace(PHONE, "[phone redacted]");
  }
  if (EMAIL.test(text)) {
    removed.push("email address");
    redacted = redacted.replace(EMAIL, "[email redacted]");
  }
  if (SSN.test(text)) {
    removed.push("government identifier");
    redacted = redacted.replace(SSN, "[identifier redacted]");
  }

  return { redacted, removed, source: "template" };
}

/**
 * Strips direct identifiers from free text before anything is encrypted.
 *
 * Grok sees the draft only for this step; the model is instructed to return
 * redacted prose, not echo secrets back in a separate field.
 */
export async function redactClinicalText(text: string): Promise<RedactionResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { redacted: "", removed: [], source: "template" };
  }

  if (grokConfigured()) {
    const raw = await grokChat(
      [
        {
          role: "system",
          content: `You redact direct patient identifiers from clinical documentation before it is stored.

Return JSON only: {"redacted":string,"removed":string[]}
- redacted: the same note with names, phone numbers, emails, full street addresses, dates of birth, medical record numbers, and government IDs replaced with bracketed placeholders like [patient name], [phone redacted], [address redacted].
- removed: short category labels for what you redacted (e.g. "patient name", "phone number"). Never include the actual identifier values in removed.

Keep clinical facts (symptoms, meds, vitals, plans). Do not invent content.`,
        },
        { role: "user", content: trimmed },
      ],
      { json: true, temperature: 0.1 },
    );

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          redacted?: string;
          removed?: unknown;
        };
        if (typeof parsed.redacted === "string" && parsed.redacted.trim()) {
          const removed = Array.isArray(parsed.removed)
            ? parsed.removed.filter((item): item is string => typeof item === "string")
            : [];
          return {
            redacted: parsed.redacted.trim(),
            removed,
            source: "grok",
          };
        }
      } catch {
        // fall through
      }
    }
  }

  return templateRedact(trimmed);
}
