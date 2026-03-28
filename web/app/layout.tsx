import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/dashboard/app-shell";
import { LiveSnapshotProvider } from "@/components/dashboard/live-snapshot-provider";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Forensic Listener",
  description: "Ethereum transaction tracing, entity intelligence, and forensic alerting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} overflow-x-hidden font-[family-name:var(--font-sans)]`}
      >
        <LiveSnapshotProvider>
          <AppShell>{children}</AppShell>
        </LiveSnapshotProvider>
      </body>
    </html>
  );
}
