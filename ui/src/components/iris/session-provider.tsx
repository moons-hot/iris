"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useIrisSession } from "@/hooks/use-iris-session";

type SessionValue = ReturnType<typeof useIrisSession>;

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the hardware session above the router, so the heartbeat keeps running
 * while the clinician moves between the lens, the dashboard and the patient view.
 */
export function IrisSessionProvider({ children }: { children: ReactNode }) {
  const session = useIrisSession();
  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside IrisSessionProvider");
  }
  return value;
}
