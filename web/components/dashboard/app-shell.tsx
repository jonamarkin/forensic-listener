"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  CircleHelp,
  Compass,
  FileCode2,
  Network,
  Settings,
  ShieldAlert,
  UserRound,
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

const footerItems = [
  { label: "Help Center", icon: CircleHelp },
  { label: "Setting", icon: Settings },
  { label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen text-[#132118]">
      <div className="mx-auto flex min-h-screen max-w-[1440px] gap-4 px-3 py-4 sm:px-5 sm:py-6 lg:gap-5 lg:px-8 lg:py-10">
        <aside className="hidden w-[208px] shrink-0 flex-col rounded-[28px] border border-[#e8ebe4] bg-[linear-gradient(180deg,#f5f6f2_0%,#f1f3ee_100%)] p-4 shadow-[0_28px_80px_rgba(28,41,26,0.08)] md:flex">
          <div className="flex items-center justify-between gap-3 px-2 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-[linear-gradient(180deg,#2a6a31_0%,#163e1a_100%)] text-[11px] font-semibold text-white">
                F
              </div>
              <div className="text-sm font-semibold text-[#1c281d]">Forensic</div>
            </div>
            <div className="flex size-6 items-center justify-center rounded-md border border-[#e0e5dc] bg-white text-[#8f9990]">
              <div className="size-2 rounded-[3px] border border-current" />
            </div>
          </div>

          <div className="space-y-6 pt-2">
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
                          "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition",
                          active
                            ? "bg-white text-[#1b2d1e] shadow-[0_10px_24px_rgba(24,40,26,0.06)]"
                            : "text-[#4d5b50] hover:bg-white/78 hover:text-[#1b2d1e]",
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

          <div className="mt-auto space-y-1 pt-8">
            {footerItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-[#5b685d] transition hover:bg-white/78 hover:text-[#1b2d1e]"
                >
                  <span className="flex size-6 items-center justify-center rounded-lg text-[#6b776d]">
                    <Icon className="size-4" />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col rounded-[30px] border border-[#e8ebe4] bg-[linear-gradient(180deg,rgba(252,252,249,0.98),rgba(248,249,245,0.96))] px-4 py-4 shadow-[0_28px_80px_rgba(28,41,26,0.08)] sm:px-5 lg:px-6">
          <header className="flex flex-col gap-3 border-b border-[#edf0e9] pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl border border-[#e4e8e0] bg-[#f5f6f2] text-[#6c776d] md:hidden">
                <Compass className="size-4" />
              </div>
              <AddressJump />
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="hidden items-center gap-2 rounded-2xl border border-[#e6e9e2] bg-[#f7f8f4] px-3 py-2 text-xs font-medium text-[#607063] sm:flex">
                <span className="size-2 rounded-full bg-[#28b04e]" />
                Live node
              </div>

              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-2xl border border-[#e6e9e2] bg-[#f7f8f4] text-[#607063] transition hover:bg-white"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
              </button>

              <div className="flex items-center gap-2 rounded-2xl border border-[#e6e9e2] bg-[#f7f8f4] px-2.5 py-2">
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
                      : "border-[#dbe3d8] bg-white text-[#5b685d]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
