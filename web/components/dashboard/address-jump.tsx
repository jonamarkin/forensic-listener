"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddressJump() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [isPending, startTransition] = useTransition();

  function goTo(path: "account" | "graph") {
    const trimmed = address.trim();
    if (!trimmed) {
      return;
    }

    startTransition(() => {
      if (path === "account") {
        router.push(`/accounts/${encodeURIComponent(trimmed)}`);
        return;
      }
      router.push(`/graph?address=${encodeURIComponent(trimmed)}&depth=2`);
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 rounded-[24px] border border-white/8 bg-black/20 p-3 sm:rounded-[26px] md:max-w-[440px] md:min-w-[340px] md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Search className="size-4 text-cyan-200/80" />
        <Input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Jump to an address or contract"
          className="h-10 border-none bg-transparent px-0 shadow-none focus:ring-0"
        />
      </div>
      <div className="flex min-w-0 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => goTo("account")}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Account
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => goTo("graph")}
          disabled={isPending}
          className="flex-1 md:flex-none"
        >
          Trace
          <ArrowRightLeft className="size-4" />
        </Button>
      </div>
    </div>
  );
}
