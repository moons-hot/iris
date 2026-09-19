"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type {
  ConceptFrequencyView,
  PopulationContextView,
} from "@/lib/pipeline";

function percent(frequency: number): number {
  return Math.round(frequency * 100);
}

function ConceptList({
  title,
  rows,
}: {
  title: string;
  rows: ConceptFrequencyView[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium">{title}</p>
      <ul className="flex flex-col gap-2">
        {rows.slice(0, 6).map((row) => (
          <li key={row.concept} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate">{row.concept}</span>
              <span className="text-muted-foreground shrink-0">
                {percent(row.frequency)}% · {row.count}
              </span>
            </div>
            <Progress value={percent(row.frequency)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PopulationContextPanel({
  population,
}: {
  population: PopulationContextView | null;
}) {
  if (!population) {
    return (
      <section className="flex flex-col gap-1 rounded-lg border px-3 py-2">
        <p className="text-xs font-medium">Synthetic clinical contexts</p>
        <p className="text-muted-foreground text-xs">
          Population retrieval was not used for this question.
        </p>
      </section>
    );
  }

  if (population.status !== "ok") {
    return (
      <section className="flex flex-col gap-1 rounded-lg border px-3 py-2">
        <p className="text-xs font-medium">Synthetic clinical contexts</p>
        <p className="text-muted-foreground text-xs">
          {population.reason ??
            "Snowflake population retrieval is unavailable."}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium">Synthetic clinical contexts</p>
        <Badge variant="outline">{population.matchedContexts} matched</Badge>
      </div>
      <p className="text-muted-foreground text-xs">{population.corpusNote}</p>
      <ConceptList title="Observations" rows={population.observations} />
      <ConceptList title="Medications" rows={population.medications} />
      <ConceptList title="Procedures" rows={population.procedures} />
      <ConceptList title="Conditions" rows={population.conditions} />
    </section>
  );
}
