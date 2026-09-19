import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-8 px-6 py-16 text-center">
        <p className="text-xs font-medium tracking-[0.35em] text-muted-foreground uppercase">
          Autonomous Health Investigation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          MED-1
        </h1>
        <p className="text-muted-foreground">
          Onboard medical investigation for deep-space crews. Mission data is
          served from in-memory onboard storage.
        </p>
        <Button asChild>
          <Link href="/station">Open medical station</Link>
        </Button>
        <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
          <Link href="/api/mission" className="hover:text-foreground">
            /api/mission
          </Link>
          <Link href="/api/crew/A02" className="hover:text-foreground">
            /api/crew/A02
          </Link>
          <Link href="/api/environment" className="hover:text-foreground">
            /api/environment
          </Link>
        </div>
      </div>
    </main>
  );
}
