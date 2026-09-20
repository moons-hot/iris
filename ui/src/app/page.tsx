import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 rounded-[2rem] bg-card/90 px-8 py-14 text-center shadow-[var(--panel-shadow)]">
        <p className="text-xs font-medium tracking-[0.28em] text-muted-foreground uppercase">
          Iris
        </p>
        <h1 className="font-serif text-6xl tracking-tight">Iris</h1>
        <p className="max-w-sm text-muted-foreground">
          Crew health, cabin air, suit pressure, and solar weather — onboard
          for the crew who needs help, and on the ground for the people
          watching the fleet.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-6 text-base">
            <Link href="/station">Open station</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="h-12 px-6 text-base"
          >
            <Link href="/groundbase">Open groundbase</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
