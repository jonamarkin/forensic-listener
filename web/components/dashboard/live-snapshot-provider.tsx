"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { StreamSnapshot } from "@/lib/types";

type LiveStatus = "connecting" | "live" | "reconnecting";

type LiveSnapshotContextValue = {
  snapshot: StreamSnapshot | null;
  lastSyncAt: Date | null;
  status: LiveStatus;
};

const LiveSnapshotContext = createContext<LiveSnapshotContextValue | null>(null);

export function LiveSnapshotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<StreamSnapshot | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");

  const handleSnapshot = useCallback((event: MessageEvent<string>) => {
    try {
      const nextSnapshot = JSON.parse(event.data) as StreamSnapshot;
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setLastSyncAt(nextSnapshot.timestamp ? new Date(nextSnapshot.timestamp) : new Date());
        setStatus("live");
      });
    } catch {
      setStatus("reconnecting");
    }
  }, []);

  useEffect(() => {
    const stream = new EventSource("/api/forensic/stream/events");
    setStatus("connecting");

    stream.addEventListener("open", () => {
      setStatus("live");
    });

    stream.addEventListener("snapshot", handleSnapshot);

    stream.onerror = () => {
      setStatus("reconnecting");
    };

    return () => {
      stream.close();
    };
  }, [handleSnapshot]);

  const value = useMemo(
    () => ({
      snapshot,
      lastSyncAt,
      status,
    }),
    [snapshot, lastSyncAt, status],
  );

  return (
    <LiveSnapshotContext.Provider value={value}>
      {children}
    </LiveSnapshotContext.Provider>
  );
}

export function useLiveSnapshot() {
  const context = useContext(LiveSnapshotContext);
  if (!context) {
    throw new Error("useLiveSnapshot must be used within LiveSnapshotProvider");
  }
  return context;
}
