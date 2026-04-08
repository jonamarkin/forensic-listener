"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Compass,
  FileCode2,
  Network,
  ShieldAlert,
} from "lucide-react";

import { AddressJump } from "@/components/dashboard/address-jump";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "General",
    items: [
      { href: "/overview", label: "Overview", icon: Compass },
      { href: "/alerts", label: "Alerts", icon: ShieldAlert },
      { href: "/cases", label: "Cases", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/graph", label: "Graph", icon: Network },
      { href: "/contracts", label: "Contracts", icon: FileCode2 },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen text-[#132118]">
      <div className="flex min-h-screen w-full items-start gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:gap-5 lg:px-5 lg:py-6 xl:px-6">
        <aside className="hidden h-[calc(100vh-2rem)] w-[214px] shrink-0 flex-col rounded-[30px] border border-[#e5e9e1] bg-[linear-gradient(180deg,rgba(246,247,242,0.96)_0%,rgba(240,242,236,0.98)_100%)] p-4 shadow-[0_26px_70px_rgba(28,41,26,0.07)] md:sticky md:top-4 md:flex lg:h-[calc(100vh-2.5rem)] lg:top-5 xl:h-[calc(100vh-3rem)] xl:top-6">
          <div className="flex items-center justify-between gap-3 px-2 pb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#2a6a31_0%,#163e1a_100%)] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(22,62,26,0.24)]">
                F
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1c281d]">Forensic</div>
                <div className="text-[11px] text-[#8a958a]">Investigation desk</div>
              </div>
            </div>
            <div className="flex size-6 items-center justify-center rounded-md border border-[#e0e5dc] bg-white text-[#8f9990]">
              <div className="size-2 rounded-[3px] border border-current" />
            </div>
          </div>

          <div className="min-h-0 space-y-6 overflow-y-auto pt-2">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="px-2 text-[11px] font-medium text-[#96a095]">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-[22px] px-3.5 py-3 text-sm transition",
                          active
                            ? "bg-white text-[#1b2d1e] shadow-[0_12px_28px_rgba(24,40,26,0.06)]"
                            : "text-[#4d5b50] hover:bg-white/82 hover:text-[#1b2d1e]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-lg",
                            active ? "text-[#2b6631]" : "text-[#6b776d]",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto rounded-[24px] border border-[#e5e9e1] bg-white/68 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#92a091]">
              Workspace status
            </div>
            <div className="mt-3 space-y-2 text-sm text-[#58675a]">
              <div className="flex items-center justify-between gap-3">
                <span>Sidebar mode</span>
                <span className="font-medium text-[#1f2d21]">Pinned</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Node feed</span>
                <span className="font-medium text-[#2b6631]">Live</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Case tools</span>
                <span className="font-medium text-[#1f2d21]">Enabled</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col rounded-[32px] border border-[#e5e9e1] bg-[linear-gradient(180deg,rgba(252,252,249,0.98),rgba(247,248,244,0.96))] px-4 py-4 shadow-[0_30px_80px_rgba(28,41,26,0.075)] sm:px-5 lg:px-6 xl:px-7">
          <header className="flex flex-col gap-3 rounded-[26px] border border-[#edf0e9] bg-[linear-gradient(180deg,rgba(251,252,248,0.95),rgba(247,248,244,0.9))] px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl border border-[#e4e8e0] bg-[#f5f6f2] text-[#6c776d] md:hidden">
                <Compass className="size-4" />
              </div>
              <AddressJump />
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="hidden items-center gap-2 rounded-2xl border border-[#e6e9e2] bg-white/72 px-3 py-2 text-xs font-medium text-[#607063] sm:flex">
                <span className="size-2 rounded-full bg-[#28b04e]" />
                Live node
              </div>

              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-2xl border border-[#e6e9e2] bg-white/72 text-[#607063] transition hover:bg-white"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
              </button>

              <div className="flex items-center gap-2 rounded-2xl border border-[#e6e9e2] bg-white/72 px-2.5 py-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(180deg,#f1c8b6_0%,#e9a27e_100%)] text-[11px] font-semibold text-[#5a2d16]">
                  FL
                </div>
                <div className="hidden pr-1 sm:block">
                  <div className="text-xs font-medium text-[#1f2b20]">Forensic Lab</div>
                  <div className="text-[11px] text-[#819083]">Analyst workspace</div>
                </div>
                <ChevronDown className="size-4 text-[#7d897f]" />
              </div>
            </div>
          </header>

          <div className="mb-4 mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-[#b8d6ad] bg-[#e7f1dd] text-[#1f5d26]"
                      : "border-[#dbe3d8] bg-white/86 text-[#5b685d]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <main className="min-w-0 flex-1 pt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
