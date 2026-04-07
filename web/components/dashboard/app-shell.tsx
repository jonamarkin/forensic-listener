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
    label: "Graph",
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
                ? "border-[#b8d6ad] bg-[#e7f1dd] shadow-[0_10px_30px_rgba(18,41,23,0.08)]"
                : "border-transparent bg-transparent hover:border-[#dbe3d8] hover:bg-white/70",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-10 items-center justify-center rounded-2xl border",
                active
                  ? "border-[#bdd5b5] bg-[#f3f7ee] text-[#2a6530]"
                  : "border-[#dbe3d8] bg-white/80 text-[#607063] group-hover:text-[#17301d]",
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-[#132118]">
                {item.label}
              </span>
              <span className="block text-sm leading-5 text-[#607063]">
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
          <div className="rounded-[28px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(251,252,248,0.94),rgba(240,244,234,0.98))] px-4 py-4 shadow-[0_20px_56px_rgba(18,41,23,0.08)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="w-fit">
                  Forensic Listener
                </Badge>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6b7a6d]">
                    Ethereum investigation workspace
                  </p>
                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#132118]">
                    Analyst workspace
                  </h1>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen((current) => !current)}
                className="inline-flex size-11 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white/85 text-[#17301d] transition hover:bg-white"
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
                          ? "border-[#b8d6ad] bg-[#e7f1dd] text-[#1f5d26]"
                          : "border-[#dbe3d8] bg-white/75 text-[#576559]",
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
          <div className="fixed inset-0 z-50 bg-[#132118]/20 backdrop-blur-sm md:hidden">
            <div className="absolute inset-y-0 right-0 w-full max-w-sm border-l border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(251,252,248,0.98),rgba(239,244,232,0.99))] p-5 shadow-[0_28px_96px_rgba(18,41,23,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#6b7a6d]">
                    Navigation
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#132118]">
                    Main routes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white/85 text-[#17301d]"
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-6">{renderNav("mobile")}</div>
              <div className="mt-6 rounded-[22px] border border-[color:var(--border)] bg-white/72 p-4 text-sm text-[#5d6a60]">
                Use the jump bar to open an address dossier or trace route from
                any page.
              </div>
            </div>
          </div>
        ) : null}

        <aside className="hidden md:sticky md:top-4 md:block md:h-[calc(100vh-2rem)] md:w-[310px] md:flex-shrink-0">
          <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(231,238,222,0.95),rgba(244,247,239,0.98))] p-6 shadow-[0_24px_72px_rgba(18,41,23,0.08)]">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit">
                Forensic Listener
              </Badge>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-[#6b7a6d]">
                  Ethereum investigation workspace
                </p>
                <h1 className="mt-2 text-[2.2rem] font-semibold tracking-tight text-[#132118]">
                  Investigation studio
                </h1>
                <p className="mt-3 max-w-sm text-sm leading-6 text-[#5d6a60]">
                  Review activity, trace funds, inspect entities, and preserve
                  investigations in a single workspace.
                </p>
              </div>
            </div>

            {renderNav("desktop")}

            <div className="mt-auto rounded-[28px] border border-[#dbe3d8] bg-white/78 p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-[#edf4e8] text-[#2a6530]">
                  <SquareTerminal className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#132118]">
                    Data stack
                  </p>
                  <p className="text-sm text-[#5d6a60]">
                    Go API + Postgres + Neo4j + pgvector.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#dbe3d8] bg-[#f4f7ef] px-4 py-3 text-sm text-[#5d6a60]">
                Live Ethereum ingestion with a small curated entity reference
                layer for better labeling and triage.
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 w-full flex-1 overflow-x-clip">
          <header className="mb-4 flex flex-col gap-4 overflow-hidden rounded-[30px] border border-[color:var(--border)] bg-white/80 px-5 py-5 backdrop-blur-xl sm:px-6 md:mb-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-[#6b7a6d]">
                <Activity className="size-4" />
                Investigator workspace
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-[#132118] sm:text-2xl">
                Review, trace, and document suspicious activity.
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-[#5d6a60]">
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
