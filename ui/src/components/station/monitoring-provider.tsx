"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CrewTrendReport } from "@/lib/baseline/trends";
import type { InvestigationView } from "@/lib/investigation/types";
import type { VitalCardModel } from "@/lib/station/view-model";

type MonitoringState = {
  vitals: VitalCardModel[];
  trendReport: CrewTrendReport;
  investigation: InvestigationView | null;
  streamNote: string | null;
  tick: number;
};

const MonitoringContext = createContext<MonitoringState | null>(null);

export function useMonitoring(): MonitoringState {
  const ctx = useContext(MonitoringContext);
  if (!ctx) {
    throw new Error("useMonitoring must be used within MonitoringProvider");
  }
  return ctx;
}

type MonitoringProviderProps = {
  crewId: string;
  initialVitals: VitalCardModel[];
  initialTrendReport: CrewTrendReport;
  children: ReactNode;
};

export function MonitoringProvider({
  crewId,
  initialVitals,
  initialTrendReport,
  children,
}: MonitoringProviderProps) {
  const [state, setState] = useState<MonitoringState>({
    vitals: initialVitals,
    trendReport: initialTrendReport,
    investigation: null,
    streamNote: null,
    tick: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      const res = await fetch(
        `/api/monitoring/tick?crewId=${encodeURIComponent(crewId)}`,
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as MonitoringState & {
        trendReport: CrewTrendReport;
      };
      setState({
        vitals: data.vitals,
        trendReport: data.trendReport,
        investigation: data.investigation,
        streamNote: data.streamNote,
        tick: data.tick,
      });
    }

    void pull();
    const interval = setInterval(() => void pull(), 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [crewId]);

  const value = useMemo(() => state, [state]);

  return (
    <MonitoringContext.Provider value={value}>
      {children}
    </MonitoringContext.Provider>
  );
}
