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
        <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-100">
          <Activity className="mr-1 size-3.5" />
          Live
        </Badge>
        <span className="text-xs text-slate-300/70">
          Last snapshot {formatDateTime(lastSyncAt)}
        </span>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-amber-400/30 bg-amber-500/15 text-amber-100">
          <LoaderCircle className="mr-1 size-3.5 animate-spin" />
          Reconnecting
        </Badge>
        <span className="text-xs text-slate-300/70">
          Snapshot feed is retrying in the background.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="text-cyan-100">
        <RadioTower className="mr-1 size-3.5" />
        Connecting
      </Badge>
      <span className="text-xs text-slate-300/70">
        Waiting for the first stream snapshot.
      </span>
    </div>
  );
}
