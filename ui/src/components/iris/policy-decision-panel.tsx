"use client";

import { Badge } from "@/components/ui/badge";
import type { PolicyCategoryView } from "@/lib/pipeline";

export function PolicyDecisionPanel({
  policy,
}: {
  policy: PolicyCategoryView[];
}) {
  if (policy.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border px-3 py-2">
      <p className="text-xs font-medium">Iris policy</p>
      <ul className="flex flex-col gap-1.5">
        {policy.map((entry) => {
          const allowed = entry.decision === "allow";
          const denied = entry.decision === "deny";
          return (
            <li key={entry.fragmentType} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>{entry.label}</span>
                <Badge
                  variant="outline"
                  className={
                    allowed
                      ? "border-allowed/50 text-allowed"
                      : denied
                        ? "border-restricted/50 text-restricted"
                        : undefined
                  }
                >
                  {allowed ? "allowed" : denied ? "withheld" : "not on record"}
                </Badge>
              </div>
              {denied ? (
                <p className="text-muted-foreground text-xs">{entry.reason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
