"use client";

import { Activity, LoaderCircle, RadioTower } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLiveSnapshot } from "@/components/dashboard/live-snapshot-provider";
import { formatDateTime } from "@/lib/utils";

export function LiveIndicator() {
  const { status, lastSyncAt } = useLiveSnapshot();

  if (status === "live") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-[#bed7b6] bg-[#e0edd8] text-[#2b6631]">
          <Activity className="mr-1 size-3.5" />
          Live
        </Badge>
        <span className="text-xs text-[#69766b]">
          Last snapshot {formatDateTime(lastSyncAt)}
        </span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-[#e6d3a2] bg-[#f4ead0] text-[#8a6732]">
          <LoaderCircle className="mr-1 size-3.5 animate-spin" />
          Reconnecting
        </Badge>
        <span className="text-xs text-[#69766b]">
          Snapshot feed is retrying in the background.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="text-[#465f4a]">
        <RadioTower className="mr-1 size-3.5" />
        Connecting
      </Badge>
      <span className="text-xs text-[#69766b]">
        Waiting for the first stream snapshot.
      </span>
    </div>
  );
}
