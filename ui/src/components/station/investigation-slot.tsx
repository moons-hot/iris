import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InvestigationSlot() {
  return (
    <Card className="h-full min-h-56 border-dashed">
      <CardHeader>
        <CardTitle>Investigation</CardTitle>
        <CardDescription>
          Conversation, recommended next step, and station actions will occupy
          this panel.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
