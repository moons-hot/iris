import { Badge } from "@/components/ui/badge";
import type { StationHeaderModel } from "@/lib/station/view-model";

export function StationHeader({ header }: { header: StationHeaderModel }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Medical station
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {header.title}
        </h1>
        <p className="text-sm text-muted-foreground">{header.missionName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Mission day {header.missionDay}</Badge>
        <Badge variant="outline">
          Earth comm ~{header.commDelayMinutes} min
        </Badge>
        <Badge variant="secondary">{header.linkStatus}</Badge>
      </div>
    </header>
  );
}
