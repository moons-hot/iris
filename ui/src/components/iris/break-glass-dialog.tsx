"use client";

import { useCallback, useState } from "react";
import { FingerprintIcon, MicIcon, SquareIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";

import type { Lens } from "@/lib/lens";
import type { useVoice } from "@/hooks/use-voice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type Stage = "confirm" | "confirming" | "reason";

/**
 * Break-glass: confirm on the CareKey first, then document why.
 *
 * Nothing judges the reason. Access is not held until the reason is typed.
 */
export function BreakGlassDialog({
  open,
  onOpenChange,
  sessionId,
  patientId,
  simulated,
  confirmOnDevice,
  onGranted,
  voice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  patientId: string;
  simulated: boolean;
  confirmOnDevice: (nonce: string) => Promise<string | null>;
  onGranted: (lens: Lens, patientId: string) => void;
  voice: ReturnType<typeof useVoice>;
}) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingReason, setSavingReason] = useState(false);

  const reset = useCallback(() => {
    setStage("confirm");
    setReason("");
    setError(null);
    setSavingReason(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const dictateReason = useCallback(async () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    const text = await voice.listen();
    if (text) setReason(text);
  }, [voice]);

  const openAccess = useCallback(async () => {
    setError(null);
    setStage("confirming");

    try {
      const requested = await fetch("/api/break-glass/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, patientId }),
      });
      const requestPayload = (await requested.json()) as {
        confirmationId?: string;
        nonce?: string;
        error?: string;
      };
      if (!requested.ok || !requestPayload.confirmationId || !requestPayload.nonce) {
        setError(requestPayload.error ?? "Could not start break-glass.");
        setStage("confirm");
        return;
      }

      let signature: string | null = null;
      if (!simulated) {
        try {
          signature = await confirmOnDevice(requestPayload.nonce);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "No confirmation press on the CareKey.",
          );
          setStage("confirm");
          return;
        }
      }

      const confirmed = await fetch("/api/break-glass/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          confirmationId: requestPayload.confirmationId,
          response: signature ?? undefined,
          simulate: simulated || signature === null,
        }),
      });
      const payload = (await confirmed.json()) as {
        lens?: Lens;
        anomalyFlagged?: boolean;
        overridesToday?: number;
        error?: string;
      };

      if (!confirmed.ok || !payload.lens) {
        setError(payload.error ?? "Break-glass confirmation failed.");
        setStage("confirm");
        return;
      }

      onGranted(payload.lens, patientId);
      setStage("reason");

      if (payload.anomalyFlagged) {
        toast.warning("Unusual break-glass frequency flagged", {
          description: `${payload.overridesToday} emergency overrides today. Compliance review requested. Access was still granted.`,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Break-glass failed.");
      setStage("confirm");
    }
  }, [confirmOnDevice, onGranted, patientId, sessionId, simulated]);

  const submitReason = useCallback(async () => {
    if (reason.trim().length < 4) {
      setError("A reason is required. It is recorded, not evaluated.");
      return;
    }

    setError(null);
    setSavingReason(true);
    try {
      const response = await fetch("/api/break-glass/reason", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, patientId, reason: reason.trim() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Could not save the reason.");
        return;
      }
      handleOpenChange(false);
    } finally {
      setSavingReason(false);
    }
  }, [handleOpenChange, patientId, reason, sessionId]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emergency">
            <ZapIcon className="size-4" />
            Emergency access
          </DialogTitle>
          <DialogDescription>
            {stage === "reason"
              ? "Access is open. Record why so it can be reviewed."
              : "You will not be stopped. Confirm on your CareKey to open the record."}
          </DialogDescription>
        </DialogHeader>

        {stage === "reason" ? (
          <>
            <Alert className="border-emergency/50 bg-emergency/10">
              <ZapIcon className="text-emergency" />
              <AlertTitle className="text-emergency">Access open</AlertTitle>
              <AlertDescription>
                The full clinical record is available for 15 minutes.
              </AlertDescription>
            </Alert>
            <Field>
              <FieldLabel htmlFor="break-glass-reason">Reason</FieldLabel>
              <Textarea
                id="break-glass-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Patient is unconscious after a suspected overdose and I need the full medication history."
                rows={3}
                disabled={savingReason}
                autoFocus
              />
              <FieldDescription>
                Recorded for the patient and compliance review, not to decide
                whether you get access.
              </FieldDescription>
            </Field>
          </>
        ) : null}

        {stage === "confirming" ? (
          <div className="flex items-center gap-3 rounded-lg border border-emergency/40 bg-emergency/5 p-3">
            <Spinner />
            <span className="flex items-center gap-2 text-sm font-medium">
              <FingerprintIcon className="size-4" />
              {simulated
                ? "Opening emergency access..."
                : "Press the button on your CareKey"}
            </span>
          </div>
        ) : null}

        {error ? <p className="text-sm text-restricted">{error}</p> : null}

        <DialogFooter>
          {stage === "reason" ? (
            <>
              <Button
                variant="outline"
                onClick={() => void dictateReason()}
                disabled={savingReason}
              >
                {voice.listening ? (
                  <SquareIcon data-icon="inline-start" />
                ) : (
                  <MicIcon data-icon="inline-start" />
                )}
                {voice.listening ? "Stop" : "Dictate"}
              </Button>
              <Button onClick={() => void submitReason()} disabled={savingReason}>
                Save reason
              </Button>
            </>
          ) : (
            <Button
              onClick={() => void openAccess()}
              disabled={stage === "confirming"}
            >
              Break glass
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
