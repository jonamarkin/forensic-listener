import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import { AppShell } from "@/components/dashboard/app-shell";
import { LiveSnapshotProvider } from "@/components/dashboard/live-snapshot-provider";

import "./globals.css";

const manrope = Manrope({
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
  description: "Ethereum investigation workspace for tracing, triage, and case review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${manrope.variable} ${ibmPlexMono.variable} overflow-x-hidden font-[family-name:var(--font-sans)]`}
      >
        <LiveSnapshotProvider>
          <AppShell>{children}</AppShell>
        </LiveSnapshotProvider>
      </body>
    </html>
  );
}
