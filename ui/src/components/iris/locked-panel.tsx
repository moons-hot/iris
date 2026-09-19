import Link from "next/link";
import { EyeOffIcon, LockIcon } from "lucide-react";

import { roleHome } from "@/lib/roles";
import type { Actor, SessionState } from "@/hooks/use-iris-session";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Shown wherever a page needs a live CareKey session and does not have one. */
export function LockedPanel({ state }: { state: SessionState }) {
  const terminated = state.status === "terminated";

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>
            {terminated
              ? "CareKey removed - session ended"
              : "No CareKey present"}
          </EmptyTitle>
          <EmptyDescription>
            {terminated
              ? (state.message ??
                "The CareKey stopped responding, so patient data was cleared from this screen.")
              : "Insert your CareKey to open a session. Patient context is not loaded without one."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/login">Go to sign in</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

/**
 * Shown when a live session reaches a screen that belongs to a different kind
 * of account. The session stays valid — this is the wrong door, not a failure.
 */
export function WrongRolePanel({ actor }: { actor: Actor | null }) {
  const home = roleHome(actor?.role);

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EyeOffIcon />
          </EmptyMedia>
          <EmptyTitle>This is not your view</EmptyTitle>
          <EmptyDescription>
            {actor
              ? `You are signed in as ${actor.name}. This screen belongs to a different kind of account.`
              : "This screen belongs to a different kind of account."}
          </EmptyDescription>
        </EmptyHeader>
        {home ? (
          <EmptyContent>
            <Button asChild>
              <Link href={home}>Go to your own view</Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </main>
  );
}
