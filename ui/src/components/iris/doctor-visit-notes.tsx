"use client";

import { useCallback, useState } from "react";
import { FileTextIcon, MicIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";

import { postJson } from "@/lib/fetcher";
import { useVoice } from "@/hooks/use-voice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface PrepareResponse {
  draft: string;
  draftSource: "grok" | "template";
}

export function DoctorVisitNotes({
  sessionId,
  patientId,
  onSaved,
  onCaptureActiveChange,
  assistantOpen,
  onRequestCloseAssistant,
  otherCaptureActive,
  onCreateHandoff,
}: {
  sessionId: string;
  patientId: string;
  onSaved: () => void;
  onCaptureActiveChange?: (active: boolean) => void;
  assistantOpen?: boolean;
  onRequestCloseAssistant?: () => void;
  otherCaptureActive?: boolean;
  onCreateHandoff?: () => void;
}) {
  const noteVoice = useVoice();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftSource, setDraftSource] = useState<PrepareResponse["draftSource"] | null>(
    null,
  );

  const draftFromTranscript = useCallback(
    async (transcript: string) => {
      setBusy(true);
      try {
        const result = await postJson<PrepareResponse>(
          `/api/doctor/patients/${patientId}/notes`,
          {
            sessionId,
            action: "prepare",
            transcript,
          },
        );
        setText(result.draft);
        setDraftSource(result.draftSource);
        toast.success("Dictation added to your note");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not draft the note.",
        );
      } finally {
        setBusy(false);
      }
    },
    [patientId, sessionId],
  );

  const listenAndDraft = useCallback(async () => {
    if (otherCaptureActive) {
      toast.message("Finish handoff recording first.");
      return;
    }
    if (assistantOpen) {
      onRequestCloseAssistant?.();
    }
    if (noteVoice.listening) {
      noteVoice.stop();
      onCaptureActiveChange?.(false);
      return;
    }
    onCaptureActiveChange?.(true);
    try {
      const transcript = await noteVoice.listen();
      if (!transcript?.trim()) return;
      await draftFromTranscript(transcript.trim());
    } finally {
      onCaptureActiveChange?.(false);
    }
  }, [
    assistantOpen,
    draftFromTranscript,
    noteVoice,
    onCaptureActiveChange,
    onRequestCloseAssistant,
    otherCaptureActive,
  ]);

  const save = useCallback(async () => {
    const toSave = text.trim();
    if (toSave.length < 4) {
      toast.error("Note is too short to save.");
      return;
    }
    setBusy(true);
    try {
      const result = await postJson<{
        ok: boolean;
        removed: string[];
        redactionSource: string;
      }>(`/api/doctor/patients/${patientId}/notes`, {
        sessionId,
        action: "save",
        text: toSave,
      });
      toast.success("Note saved to the chart", {
        description: result.removed.length
          ? `Identifiers redacted automatically (${result.removed.join(", ")}).`
          : "Stored with identifier scan complete.",
      });
      setDraftSource(null);
      setText("");
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the note.",
      );
    } finally {
      setBusy(false);
    }
  }, [onSaved, patientId, sessionId, text]);

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Visit documentation</h2>
        {draftSource ? (
          <Badge variant="secondary">Draft: {draftSource}</Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Write or dictate a note for the permanent chart. Identifiers are redacted
        when you save. Separate from{" "}
        <span className="text-foreground">Ask Iris</span> — audio and transcripts
        are not stored.
      </p>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Progress note for the chart…"
        rows={5}
        disabled={busy || noteVoice.listening}
      />

      {noteVoice.listening ? (
        <p className="text-xs text-muted-foreground">
          Capturing visit audio for documentation… {noteVoice.interim}
        </p>
      ) : null}
      {noteVoice.error ? (
        <p className="text-xs text-restricted">{noteVoice.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void listenAndDraft()}
        >
          {noteVoice.listening ? (
            <SquareIcon data-icon="inline-start" />
          ) : (
            <MicIcon data-icon="inline-start" />
          )}
          {noteVoice.listening ? "Stop dictation" : "Dictate visit"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || noteVoice.listening}
          onClick={() => void save()}
        >
          {busy ? <Spinner className="size-4" data-icon="inline-start" /> : null}
          Save to chart
        </Button>
        {onCreateHandoff ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || noteVoice.listening}
            onClick={onCreateHandoff}
          >
            <FileTextIcon data-icon="inline-start" />
            Create handoff
          </Button>
        ) : null}
      </div>
    </section>
  );
}
