"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Compass, FileCode2, Network } from "lucide-react";

import { AddressJump } from "@/components/dashboard/address-jump";
import { LiveIndicator } from "@/components/dashboard/live-indicator";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Investigate",
    items: [
      { href: "/overview", label: "Overview", icon: Compass },
      { href: "/graph", label: "Graph", icon: Network },
      { href: "/contracts", label: "Contracts", icon: FileCode2 },
    ],
  },
  {
    label: "Platform",
    items: [{ href: "/system", label: "System status", icon: Activity }],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen text-[#132118]">
      <div className="flex min-h-screen w-full items-start gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:gap-5 lg:px-5 lg:py-6 xl:px-6">
        <aside className="hidden h-[calc(100vh-2rem)] w-[214px] shrink-0 flex-col rounded-[30px] border border-[#e5e9e1] bg-[linear-gradient(180deg,rgba(246,247,242,0.96)_0%,rgba(240,242,236,0.98)_100%)] p-4 shadow-[0_26px_70px_rgba(28,41,26,0.07)] md:sticky md:top-4 md:flex lg:top-5 lg:h-[calc(100vh-2.5rem)] xl:top-6 xl:h-[calc(100vh-3rem)]">
          <Link href="/" className="flex items-center gap-2.5 px-2 pb-5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#2a6a31_0%,#163e1a_100%)] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(22,62,26,0.24)]">
              F
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1c281d]">Forensic Listener</div>
              <div className="text-[11px] text-[#8a958a]">Ethereum investigation</div>
            </div>
          </Link>

          <nav className="min-h-0 space-y-6 overflow-y-auto pt-2" aria-label="Main">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="px-2 text-[11px] font-medium text-[#96a095]">{group.label}</div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-[22px] px-3.5 py-3 text-sm transition",
                          active
                            ? "bg-white text-[#1b2d1e] shadow-[0_12px_28px_rgba(24,40,26,0.06)]"
                            : "text-[#4d5b50] hover:bg-white/82 hover:text-[#1b2d1e]",
                        )}
                      >
                        <Icon className={cn("size-4", active ? "text-[#2b6631]" : "text-[#6b776d]")} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto space-y-2 px-2 pt-4 text-[11px] leading-5 text-[#8a958a]">
            <div className="font-medium text-[#6b776d]">Data stores</div>
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#2c5d88]" />PostgreSQL · records</div>
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#1b7467]" />Neo4j · flows</div>
            <div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#8a5a12]" />pgvector · similarity</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col rounded-[32px] border border-[#e5e9e1] bg-[linear-gradient(180deg,rgba(252,252,249,0.98),rgba(247,248,244,0.96))] px-4 py-4 shadow-[0_30px_80px_rgba(28,41,26,0.075)] sm:px-5 lg:px-6 xl:px-7">
          <header className="sticky top-3 z-30 flex flex-col gap-3 rounded-[26px] border border-[#edf0e9] bg-[linear-gradient(180deg,rgba(251,252,248,0.96),rgba(247,248,244,0.94))] px-3 py-3 shadow-[0_16px_36px_rgba(28,41,26,0.06)] backdrop-blur-sm sm:top-4 sm:px-4 md:flex-row md:items-center md:justify-between lg:top-5">
            <AddressJump />
            <LiveIndicator />
          </header>

          <nav className="mb-2 mt-4 flex gap-2 overflow-x-auto pb-1 md:hidden" aria-label="Main">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition",
                    active ? "border-[#b8d6ad] bg-[#e7f1dd] text-[#1f5d26]" : "border-[#dbe3d8] bg-white/86 text-[#5b685d]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <main className="min-w-0 flex-1 pt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
