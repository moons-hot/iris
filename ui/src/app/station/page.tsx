import Link from "next/link";

export default function StationPlaceholderPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0e17] text-slate-100">
      <div className="mx-auto max-w-md px-6 text-center">
        <h1 className="text-2xl font-semibold">Medical station</h1>
        <p className="mt-3 text-slate-400">
          Full station UI arrives in Step 2. Mission APIs are live — use the
          links on the home page to inspect onboard data.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← Back to MED-1 home
        </Link>
      </div>
    </main>
  );
}
