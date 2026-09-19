import Link from "next/link";
import { LockIcon } from "lucide-react";

import type { SessionState } from "@/hooks/use-iris-session";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Shown wherever a page needs a live hardware session and does not have one. */
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
              ? "Hardware presence lost - session terminated"
              : "No Iris Key present"}
          </EmptyTitle>
          <EmptyDescription>
            {terminated
              ? (state.message ??
                "The Iris Key stopped responding, so patient data was cleared from this screen.")
              : "Present your Iris Key to open a session. Patient context is not loaded without one."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">Go to authentication</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
