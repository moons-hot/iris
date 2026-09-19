"use client";

import { useCallback, useState } from "react";
import { FileTextIcon, MicIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";

import { useVoice } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export function DoctorHandoffDialog({
  open,
  onOpenChange,
  sessionId,
  patientId,
  defaultSpecialty = "Cardiology",
  onCreated,
  onCaptureActiveChange,
  otherCaptureActive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  patientId: string;
  defaultSpecialty?: string;
  onCreated: () => void;
  onCaptureActiveChange?: (active: boolean) => void;
  otherCaptureActive?: boolean;
}) {
  const voice = useVoice();
  const [specialty, setSpecialty] = useState(defaultSpecialty);
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        voice.stop();
        onCaptureActiveChange?.(false);
      }
      onOpenChange(next);
    },
    [onCaptureActiveChange, onOpenChange, voice],
  );

  const listen = useCallback(async () => {
    if (otherCaptureActive) {
      toast.message("Finish visit-note dictation first.");
      return;
    }
    if (voice.listening) {
      voice.stop();
      onCaptureActiveChange?.(false);
      return;
    }
    onCaptureActiveChange?.(true);
    try {
      const transcript = await voice.listen();
      if (!transcript?.trim()) return;
      const chunk = transcript.trim();
      setContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${chunk}` : chunk));
    } finally {
      onCaptureActiveChange?.(false);
    }
  }, [onCaptureActiveChange, otherCaptureActive, voice]);

  const submit = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          patientId,
          specialty: specialty.trim() || "Cardiology",
          clinicianContext: context.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        action?: { title: string };
        included?: string[];
        excluded?: string[];
        error?: string;
      };
      if (!response.ok || !payload.action) {
        toast.error(payload.error ?? "Could not create the handoff.");
        return;
      }
      toast.success(payload.action.title, {
        description: `${payload.included?.length ?? 0} authorized fields included, ${payload.excluded?.length ?? 0} excluded.`,
      });
      onCreated();
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [context, handleOpenChange, onCreated, patientId, sessionId, specialty]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Specialist handoff</DialogTitle>
          <DialogDescription>
            Record or type what you want the receiving team to know. Iris builds
            the handoff from your chart&apos;s authorized fields plus this
            summary. Audio is not stored.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Specialty</FieldLabel>
          <Input
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            placeholder="Cardiology"
            disabled={busy || voice.listening}
          />
          <FieldDescription>
            Used as the handoff title and routing label.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Your summary</FieldLabel>
          <Textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Reason for consult, urgency, what you want them to focus on…"
            rows={6}
            disabled={busy || voice.listening}
          />
          {voice.listening ? (
            <FieldDescription>
              Listening… {voice.interim}
            </FieldDescription>
          ) : null}
          {voice.error ? (
            <p className="text-xs text-restricted">{voice.error}</p>
          ) : null}
        </Field>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || otherCaptureActive}
            onClick={() => void listen()}
          >
            {voice.listening ? (
              <SquareIcon data-icon="inline-start" />
            ) : (
              <MicIcon data-icon="inline-start" />
            )}
            {voice.listening ? "Stop recording" : "Record summary"}
          </Button>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || voice.listening}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || voice.listening}
              onClick={() => void submit()}
            >
              {busy ? (
                <Spinner className="size-4" data-icon="inline-start" />
              ) : (
                <FileTextIcon data-icon="inline-start" />
              )}
              Generate handoff
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
