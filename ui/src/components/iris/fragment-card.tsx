import { EyeOffIcon, LockIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface FragmentView {
  id: string;
  label: string;
  fragmentType: string;
  sensitivity: string;
  decision: "allow" | "allow_transformed" | "deny";
  transform: string;
  transformLabel: string | null;
  reason: string;
  value: string | null;
}

/**
 * One field of the record, in one of four states. Restricted fields stay on
 * screen with their reason attached: a field that silently disappears teaches
 * nobody anything, least of all a judge.
 */
export function FragmentCard({
  fragment,
  emergency = false,
}: {
  fragment: FragmentView;
  emergency?: boolean;
}) {
  const denied = fragment.decision === "deny";
  const reduced = fragment.decision === "allow_transformed";

  const accent = denied
    ? "border-restricted/40 bg-restricted/5"
    : reduced
      ? "border-limited/40 bg-limited/5"
      : emergency
        ? "border-emergency/50 bg-emergency/5"
        : "border-allowed/40 bg-allowed/5";

  return (
    <Card className={cn("gap-3 border transition-colors", accent)}>
      <CardHeader className="gap-1">
        <CardTitle className="text-sm font-medium">{fragment.label}</CardTitle>
        <CardDescription className="text-xs capitalize">
          {fragment.sensitivity.replace(/_/g, " ")}
        </CardDescription>
        <CardAction>
          <StateBadge denied={denied} reduced={reduced} emergency={emergency} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {denied ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-restricted">
              <LockIcon className="size-4" />
              Locked
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {fragment.reason}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {fragment.value}
            </p>
            {reduced ? (
              <p className="flex items-center gap-1.5 text-xs text-limited">
                <SparklesIcon className="size-3.5" />
                {fragment.transformLabel}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StateBadge({
  denied,
  reduced,
  emergency,
}: {
  denied: boolean;
  reduced: boolean;
  emergency: boolean;
}) {
  if (denied) {
    return (
      <Badge variant="outline" className="border-restricted/50 text-restricted">
        <EyeOffIcon data-icon="inline-start" />
        Restricted
      </Badge>
    );
  }
  if (reduced) {
    return (
      <Badge variant="outline" className="border-limited/50 text-limited">
        <SparklesIcon data-icon="inline-start" />
        Reduced
      </Badge>
    );
  }
  if (emergency) {
    return (
      <Badge variant="outline" className="border-emergency/50 text-emergency">
        <ShieldCheckIcon data-icon="inline-start" />
        Emergency
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-allowed/50 text-allowed">
      <ShieldCheckIcon data-icon="inline-start" />
      Allowed
    </Badge>
  );
}
