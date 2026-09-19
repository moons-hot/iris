"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, EyeIcon, ShieldIcon, StethoscopeIcon, WrenchIcon } from "lucide-react";

import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Iris Key", icon: ShieldIcon },
  { href: "/provider", label: "Provider", icon: StethoscopeIcon },
  { href: "/engineer", label: "Engineer", icon: WrenchIcon },
  { href: "/patient", label: "Patient", icon: EyeIcon },
  { href: "/security", label: "Security", icon: ActivityIcon },
];

export function IrisNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            IR
          </span>
          <span className="font-semibold tracking-tight">Iris</span>
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <link.icon className="size-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </div>
        <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
          Synthetic data. Prototype, not a HIPAA-compliant deployment.
        </span>
      </nav>
    </header>
  );
}
