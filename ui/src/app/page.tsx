import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0e17] text-slate-100">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-8 px-6 py-16 text-center">
        <p className="text-xs font-medium tracking-[0.35em] text-cyan-400/90 uppercase">
          Autonomous Health Investigation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          MED-1
        </h1>
        <p className="text-slate-400">
          Onboard medical investigation for deep-space crews. Mission data is
          served from in-memory onboard storage.
        </p>
        <Link
          href="/station"
          className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-6 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20"
        >
          Open medical station
        </Link>
        <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-500">
          <Link href="/api/mission" className="hover:text-slate-300">
            /api/mission
          </Link>
          <Link href="/api/crew/A02" className="hover:text-slate-300">
            /api/crew/A02
          </Link>
          <Link href="/api/environment" className="hover:text-slate-300">
            /api/environment
          </Link>
        </div>
      </div>
    </main>
  );
}
