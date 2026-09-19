"use client";

import { useCallback, useState } from "react";
import { FingerprintIcon, MicIcon, SquareIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";

import type { Lens } from "@/app/provider/page";
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

type Stage = "reason" | "confirming" | "granted";

/**
 * Break-glass in three steps: state a reason, press the button on the Iris Key,
 * get access.
 *
 * Nothing here judges the reason. The reason is captured so the access can be
 * reviewed afterwards, which is the entire point.
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
  onGranted: (lens: Lens) => void;
  voice: ReturnType<typeof useVoice>;
}) {
  const [stage, setStage] = useState<Stage>("reason");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setStage("reason");
        setReason("");
        setError(null);
        setExpiresAt(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const dictateReason = useCallback(async () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    const text = await voice.listen();
    if (text) setReason(text);
  }, [voice]);

  const submit = useCallback(async () => {
    if (reason.trim().length < 4) {
      setError("A reason is required. It is recorded, not evaluated.");
      return;
    }

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
        setStage("reason");
        return;
      }

      // On real hardware this blocks until the clinician presses the button.
      let signature: string | null = null;
      if (!simulated) {
        try {
          signature = await confirmOnDevice(requestPayload.nonce);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "No confirmation press on the Iris Key.",
          );
          setStage("reason");
          return;
        }
      }

      const confirmed = await fetch("/api/break-glass/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          confirmationId: requestPayload.confirmationId,
          reason,
          response: signature ?? undefined,
          simulate: simulated || signature === null,
        }),
      });
      const payload = (await confirmed.json()) as {
        lens?: Lens;
        expiresAt?: string;
        anomalyFlagged?: boolean;
        overridesToday?: number;
        error?: string;
      };

      if (!confirmed.ok || !payload.lens) {
        setError(payload.error ?? "Break-glass confirmation failed.");
        setStage("reason");
        return;
      }

      setExpiresAt(payload.expiresAt ?? null);
      setStage("granted");
      onGranted(payload.lens);

      if (payload.anomalyFlagged) {
        toast.warning("Unusual break-glass frequency flagged", {
          description: `${payload.overridesToday} emergency overrides today. Compliance review requested. Access was still granted.`,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Break-glass failed.");
      setStage("reason");
    }
  }, [confirmOnDevice, onGranted, patientId, reason, sessionId, simulated]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emergency">
            <ZapIcon className="size-4" />
            Emergency access
          </DialogTitle>
          <DialogDescription>
            Access is granted first. Accountability comes afterwards: the reason,
            the time and the fields opened are all recorded.
          </DialogDescription>
        </DialogHeader>

        {stage === "granted" ? (
          <Alert className="border-emergency/50 bg-emergency/10">
            <ZapIcon className="text-emergency" />
            <AlertTitle className="text-emergency">
              Emergency access active
            </AlertTitle>
            <AlertDescription>
              Expanded clinical context is open until{" "}
              {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "the window closes"}.
              This event has been logged and flagged for review.
            </AlertDescription>
          </Alert>
        ) : (
          <Field>
            <FieldLabel htmlFor="break-glass-reason">
              Reason for emergency access
            </FieldLabel>
            <Textarea
              id="break-glass-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Patient became unconscious after a suspected overdose and I need the complete medication history."
              rows={3}
              disabled={stage === "confirming"}
            />
            <FieldDescription>
              {simulated
                ? "Simulated key: the physical press is signed server-side and tagged simulated."
                : "After submitting, press the button on your Iris Key to confirm."}
            </FieldDescription>
          </Field>
        )}

        {stage === "confirming" ? (
          <div className="flex items-center gap-3 rounded-lg border border-emergency/40 bg-emergency/5 p-3">
            <Spinner />
            <div className="flex flex-col">
              <span className="flex items-center gap-2 text-sm font-medium">
                <FingerprintIcon className="size-4" />
                Waiting for physical confirmation
              </span>
              <span className="text-xs text-muted-foreground">
                Press the button on your Iris Key.
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-restricted">{error}</p>
        ) : null}

        <DialogFooter>
          {stage === "granted" ? (
            <Button onClick={() => handleOpenChange(false)}>Continue</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => void dictateReason()}
                disabled={stage === "confirming"}
              >
                {voice.listening ? (
                  <SquareIcon data-icon="inline-start" />
                ) : (
                  <MicIcon data-icon="inline-start" />
                )}
                {voice.listening ? "Stop" : "Dictate reason"}
              </Button>
              <Button onClick={() => void submit()} disabled={stage === "confirming"}>
                Break glass
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
