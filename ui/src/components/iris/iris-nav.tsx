"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EyeIcon, UsersIcon } from "lucide-react";

import { cn } from "cn";
import { useSession } from "@/components/iris/session-provider";
import { roleHome } from "@/lib/roles";
import { Button } from "@/components/ui/button";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/** The navigation only ever offers the surfaces the current credential owns. */
const LINKS_BY_ROLE: Record<string, NavLink[]> = {
  physician: [{ href: "/doctor", label: "Patients", icon: UsersIcon }],
  patient: [{ href: "/patient", label: "My access", icon: EyeIcon }],
};

export function IrisNav() {
  const pathname = usePathname();
  const { state, signOut } = useSession();

  // The login screen is the one surface that is not part of the app shell.
  if (pathname === "/login") return null;

  const role = state.actor?.role;
  const links: NavLink[] = role ? (LINKS_BY_ROLE[role] ?? []) : [];
  const home = roleHome(role) ?? "/login";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href={home} className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            IR
          </span>
          <span className="font-semibold tracking-tight">Iris</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
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
        {state.status === "authenticated" && state.actor ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {state.actor.name}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void signOut()}>
              End session
            </Button>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
