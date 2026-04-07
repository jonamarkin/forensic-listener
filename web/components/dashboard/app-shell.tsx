"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BriefcaseBusiness,
  Compass,
  FileCode2,
  Menu,
  Network,
  ShieldAlert,
  SquareTerminal,
  X,
} from "lucide-react";

import { AddressJump } from "@/components/dashboard/address-jump";
import { LiveIndicator } from "@/components/dashboard/live-indicator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/overview",
    label: "Overview",
    description: "System health and recent activity.",
    icon: Compass,
  },
  {
    href: "/graph",
    label: "Flow Canvas",
    description: "Tracing, hubs, and path expansion.",
    icon: Network,
  },
  {
    href: "/alerts",
    label: "Alerts",
    description: "Flags, spikes, and triage.",
    icon: ShieldAlert,
  },
  {
    href: "/cases",
    label: "Cases",
    description: "Saved investigations and evidence.",
    icon: BriefcaseBusiness,
  },
  {
    href: "/contracts",
    label: "Contracts",
    description: "Code intelligence and similarity.",
    icon: FileCode2,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const renderNav = (mode: "desktop" | "mobile") => (
    <nav className={cn(mode === "desktop" ? "mt-8 space-y-2" : "space-y-2")}>
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={`${mode}:${item.href}`}
            href={item.href}
            className={cn(
              "group flex items-start gap-4 rounded-[22px] border px-4 py-4 transition-all",
              active
                ? "border-cyan-300/25 bg-cyan-400/[0.08] shadow-[0_12px_36px_rgba(34,193,195,0.08)]"
                : "border-transparent bg-white/[0.02] hover:border-white/8 hover:bg-white/[0.04]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-10 items-center justify-center rounded-2xl border",
                active
                  ? "border-cyan-300/25 bg-cyan-400/[0.08] text-cyan-100"
                  : "border-white/8 bg-white/5 text-slate-300 group-hover:text-white",
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-white">
                {item.label}
              </span>
              <span className="block text-sm leading-5 text-slate-300/75">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-clip text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-3 py-3 sm:px-4 md:flex-row md:gap-6 md:px-6 md:py-4">
        <div className="sticky top-3 z-40 md:hidden">
          <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,23,35,0.94),rgba(6,14,24,0.98))] px-4 py-4 shadow-[0_24px_72px_rgba(2,6,23,0.36)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="w-fit text-cyan-100">
                  Forensic Listener
                </Badge>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">
                    Ethereum investigation workspace
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
                    Analyst workspace
                  </h1>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen((current) => !current)}
                className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={mobileNavOpen}
              >
                {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
            <div className="mt-4">
              <LiveIndicator />
            </div>
            <div className="mt-4 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {navItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={`mobile-chip:${item.href}`}
                      href={item.href}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition",
                        active
                          ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-white/5 text-slate-200",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm md:hidden">
            <div className="absolute inset-y-0 right-0 w-full max-w-sm border-l border-white/10 bg-[linear-gradient(180deg,rgba(12,23,35,0.97),rgba(6,14,24,0.99))] p-5 shadow-[0_28px_120px_rgba(2,6,23,0.5)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-200/78">
                    Navigation
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    Investigation routes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100"
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-6">{renderNav("mobile")}</div>
              <div className="mt-6 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-slate-300/78">
                Use the jump bar to open an address dossier or trace route from
                any page.
              </div>
            </div>
          </div>
        ) : null}

        <aside className="hidden md:sticky md:top-4 md:block md:h-[calc(100vh-2rem)] md:w-[310px] md:flex-shrink-0">
          <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,23,35,0.9),rgba(6,14,24,0.98))] p-6 shadow-[0_28px_96px_rgba(2,6,23,0.36)]">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit text-cyan-100">
                Forensic Listener
              </Badge>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-200/80">
                  Ethereum investigation workspace
                </p>
                <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-white">
                  Analyst console
                </h1>
                <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300/80">
                  Review activity, trace funds, inspect entities, and preserve
                  investigations in a single workspace.
                </p>
              </div>
            </div>

            {renderNav("desktop")}

            <div className="mt-auto rounded-[24px] border border-white/8 bg-black/20 p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-100">
                  <SquareTerminal className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Data stack
                  </p>
                  <p className="text-sm text-slate-300/75">
                    Go API + Postgres + Neo4j + pgvector.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-3 text-sm text-slate-300/78">
                Live Ethereum ingestion with a small curated entity reference
                layer for better labeling and triage.
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 w-full flex-1 overflow-x-clip">
          <header className="mb-4 flex flex-col gap-4 overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/35 px-4 py-4 backdrop-blur-xl sm:px-5 sm:py-5 md:mb-6 md:px-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                <Activity className="size-4" />
                Investigator workspace
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Review, trace, and document suspicious activity.
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300/76">
                Use overview for system context, alerts for triage, graph for
                tracing, accounts for dossiers, and cases for preserved
                investigations.
              </p>
              <div className="hidden pt-2 md:block">
                <LiveIndicator />
              </div>
            </div>
            <AddressJump />
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
