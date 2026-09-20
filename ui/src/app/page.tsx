import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col px-6 py-6 md:px-8 md:py-8">
      <header className="relative z-10 flex items-center justify-end">
        <div className="animate-[iris-rise_0.7s_ease-out_0.05s_both]">
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 pb-16 text-center">
        <Link
          href="/station"
          className="group outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h1 className="animate-[iris-rise_0.85s_ease-out_0.08s_both] font-serif text-[clamp(4.5rem,14vw,9rem)] leading-[0.9] tracking-tight transition duration-500 group-hover:opacity-90">
            Iris
          </h1>
        </Link>

        <div className="flex animate-[iris-rise_0.85s_ease-out_0.18s_both] flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="h-12 min-w-[10.5rem] px-6 text-base transition duration-300 hover:-translate-y-0.5"
          >
            <Link href="/station">Station</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="h-12 min-w-[10.5rem] px-6 text-base transition duration-300 hover:-translate-y-0.5"
          >
            <Link href="/groundbase">Mission Control</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
