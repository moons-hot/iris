"use client";

import { useRouter } from "next/navigation";

import type { CrewMember } from "@/lib/db/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CrewSelector({
  crew,
  selectedId,
}: {
  crew: CrewMember[];
  selectedId: string;
}) {
  const router = useRouter();
  const selected = crew.find((member) => member.id === selectedId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew at station</CardTitle>
        <CardDescription>
          {selected
            ? `${selected.displayName} · ${selected.role}`
            : "Select a crew member"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={selectedId}
          onValueChange={(crewId) => {
            router.push(`/station?crew=${crewId}`);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Select crew member">
            <SelectValue placeholder="Select crew" />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {crew.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.id} · {member.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
