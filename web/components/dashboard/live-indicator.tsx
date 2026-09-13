"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { cn, formatExact, formatRelativeTime } from "@/lib/utils";

const STALE_AFTER_MS = 60_000;

type Tone = "live" | "warn" | "down";

/**
 * Header status driven by real signals: the browser's event stream connection and
 * the backend's node feeds. Replaces a dot that was always green.
 */
export function LiveIndicator() {
  const { status, snapshot } = useLiveSnapshot();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  let tone: Tone = "warn";
  let label = "Connecting";
  let detail = "Waiting for the first live snapshot.";

  if (status === "reconnecting") {
    tone = "down";
    label = "API offline";
    detail = "The live stream from the Go API dropped. Retrying.";
  } else if (snapshot) {
    const ingestion = snapshot.ingestion;
    const lastEvent = Math.max(
      ingestion.last_pending_at ? new Date(ingestion.last_pending_at).getTime() : 0,
      ingestion.last_head_at ? new Date(ingestion.last_head_at).getTime() : 0,
    );
    const connected = ingestion.pending_feed_connected || ingestion.head_feed_connected;

    if (!connected) {
      tone = "down";
      label = "Node disconnected";
      detail = "Neither the pending-transaction nor the block feed is connected.";
    } else if (!lastEvent || now - lastEvent > STALE_AFTER_MS) {
      tone = "warn";
      label = "Feed idle";
      detail = `Connected, but no data for ${formatRelativeTime(lastEvent ? new Date(lastEvent) : null, now).replace(" ago", "")}.`;
    } else {
      tone = "live";
      label = ingestion.last_block ? `Live · block ${formatExact(ingestion.last_block)}` : "Live";
      detail = `Last node event ${formatRelativeTime(new Date(lastEvent), now)}.`;
    }
  }

  return (
    <Link
      href="/system"
      title={detail}
      className={cn(
        "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition hover:bg-white",
        tone === "live" && "border-[#cfe3c8] bg-[#f1f8ee] text-[#2b6631]",
        tone === "warn" && "border-[#eadcb4] bg-[#fbf6e8] text-[#8a6732]",
        tone === "down" && "border-[#ecc5c0] bg-[#fcefed] text-[#933f34]",
      )}
    >
      <span className="relative flex size-2">
        {tone === "live" ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#28b04e] opacity-60 motion-reduce:hidden" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            tone === "live" && "bg-[#28b04e]",
            tone === "warn" && "bg-[#d19a2a]",
            tone === "down" && "bg-[#c54d41]",
          )}
        />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}
