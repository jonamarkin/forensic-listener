"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function AddressJump() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) {
      return;
    }

    let target: string | null = null;
    if (TX_HASH.test(value)) {
      target = `/transactions/${value}`;
    } else if (ADDRESS.test(value)) {
      target = `/accounts/${value}`;
    }

    if (!target) {
      setError("Enter an address (0x + 40 hex characters) or a transaction hash (0x + 64).");
      return;
    }

    setError(null);
    startTransition(() => router.push(target));
  }

  return (
    <form className="relative w-full md:max-w-[440px]" onSubmit={onSubmit} role="search">
      <label htmlFor="global-search" className="sr-only">
        Search by address or transaction hash
      </label>
      <div className="flex h-12 w-full min-w-0 items-center gap-2 rounded-2xl border border-[#ecefe8] bg-[#f5f6f2] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] focus-within:border-[#9bc58b]">
        <Search className="size-4 shrink-0 text-[#6b7c6e]" aria-hidden="true" />
        <Input
          id="global-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          placeholder="Search address or transaction hash"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "global-search-error" : undefined}
          className="h-10 border-none bg-transparent px-0 font-mono text-[13px] text-[#132118] shadow-none placeholder:font-sans placeholder:text-[#98a39a] focus:ring-0"
        />
        <span className="rounded-lg border border-[#e5e8e0] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a948b]">
          {isPending ? "…" : "Enter"}
        </span>
      </div>
      {error ? (
        <p id="global-search-error" role="alert" className="absolute left-2 top-full mt-1 rounded-lg bg-white px-2 py-1 text-xs text-[#933f34] shadow">
          {error}
        </p>
      ) : null}
    </form>
  );
}
