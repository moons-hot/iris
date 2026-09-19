"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  groupEvidenceByLayer,
  type EvidenceLayer,
} from "@/lib/evidence/retrieve";
import type { InvestigationEvidence } from "@/lib/investigation/types";

const LAYER_LABEL: Record<EvidenceLayer, string> = {
  astronaut: "Astronaut",
  spacecraft: "Spacecraft",
  space: "Space environment",
  historical: "Historical (OSDR)",
};

const KIND_LABEL: Record<InvestigationEvidence["kind"], string> = {
  observation: "Observation",
  personal_deviation: "Personal deviation",
  correlation: "Correlation",
  historical_context: "Historical context",
};

const LAYER_ORDER: EvidenceLayer[] = [
  "astronaut",
  "spacecraft",
  "space",
  "historical",
];

type EvidenceBoardProps = {
  evidence: InvestigationEvidence[];
};

export function EvidenceBoard({ evidence }: EvidenceBoardProps) {
  const groups = groupEvidenceByLayer(evidence);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Evidence board
        </p>
        <p className="text-xs text-muted-foreground">
          Four layers — correlation and historical context are not causation.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LAYER_ORDER.map((layer) => {
          const items = groups[layer];
          return (
            <Card key={layer} size="sm" className="min-h-28">
              <CardHeader>
                <CardTitle className="text-sm">{LAYER_LABEL[layer]}</CardTitle>
                <CardDescription>
                  {items.length === 0
                    ? "No cards yet"
                    : `${items.length} card${items.length === 1 ? "" : "s"}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex max-h-44 flex-col gap-2 overflow-y-auto">
                {items.map((item) => {
                  const citation =
                    typeof item.metadata?.citation_url === "string"
                      ? item.metadata.citation_url
                      : null;
                  const source =
                    typeof item.metadata?.sourceLabel === "string"
                      ? item.metadata.sourceLabel
                      : null;
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border bg-muted/20 p-2 text-xs"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="font-normal">
                          {KIND_LABEL[item.kind]}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-muted-foreground">{item.body}</p>
                      {source ? (
                        <p className="mt-1 text-muted-foreground">{source}</p>
                      ) : null}
                      {citation ? (
                        <a
                          href={citation}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-primary underline-offset-2 hover:underline"
                        >
                          Source
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
