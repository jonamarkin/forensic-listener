"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function AddressJump() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function resolveTarget(trimmed: string) {
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      return `/transactions/${encodeURIComponent(trimmed)}`;
    }

    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return `/accounts/${encodeURIComponent(trimmed)}`;
    }

    return `/accounts/${encodeURIComponent(trimmed)}`;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    startTransition(() => {
      router.push(resolveTarget(trimmed));
    });
  }

  return (
    <form
      className="flex h-12 w-full min-w-0 items-center gap-3 rounded-2xl border border-[#ecefe8] bg-[#f5f6f2] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] md:max-w-[360px]"
      onSubmit={onSubmit}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Search className="size-4 text-[#6b7c6e]" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search address or tx hash"
          className="h-10 border-none bg-transparent px-0 text-[#132118] shadow-none placeholder:text-[#98a39a] focus:ring-0"
        />
      </div>
      <div className="rounded-xl border border-[#e5e8e0] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a948b]">
        {isPending ? "..." : "Enter"}
      </div>
    </form>
  );
}
