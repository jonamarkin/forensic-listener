import Link from "next/link";
import {
  ArrowRight,
  Binary,
  Compass,
  FileCode2,
  Network,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function StoryCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="bg-white/78 shadow-[0_22px_56px_rgba(18,41,23,0.06)]">
      <CardHeader className="space-y-4">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-[#edf4e8] text-[#2b6631]">
          {icon}
        </div>
        <div className="space-y-2">
          <CardTitle className="text-[#132118]">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1400px] flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_380px]">
          <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,#17361d_0%,#234c29_56%,#8db979_100%)] text-white shadow-[0_28px_80px_rgba(18,41,23,0.18)]">
            <CardContent className="relative flex h-full flex-col justify-between gap-8 p-7 sm:p-8 lg:p-10">
              <div className="absolute inset-0 opacity-18">
                <div className="absolute -right-10 top-6 h-40 w-40 rounded-[34px] bg-white/12 rotate-12" />
                <div className="absolute right-24 top-20 h-20 w-20 rounded-[24px] bg-white/10 rotate-12" />
                <div className="absolute right-10 bottom-8 h-32 w-32 rounded-[32px] bg-[#cfe4c0]/16 rotate-12" />
              </div>

              <div className="relative space-y-5">
                <Badge className="border-white/18 bg-white/12 text-white">
                  Forensic Listener
                </Badge>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-[3.6rem]">
                    Ethereum forensics across relational, graph, and vector workloads.
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-white/78 sm:text-base">
                    Forensic Listener is a compact investigation workspace for tracing
                    blockchain activity with PostgreSQL, Neo4j, and pgvector in one
                    unified analysis environment.
                  </p>
                </div>
              </div>

              <div className="relative flex flex-wrap gap-3">
                <Button
                  asChild
                  className="!bg-white !text-[#16361b] hover:!bg-[#f3f7ef]"
                >
                  <Link href="/login">
                    Sign in
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="border-white/22 bg-white/12 text-white hover:bg-white/18"
                >
                  <Link href="/overview">
                    Open workspace
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <StoryCard
              icon={<ShieldCheck className="size-5" />}
              title="PostgreSQL"
              description="Stores transactions, accounts, flags, contract summaries, and the core source-of-truth reads."
            />
            <StoryCard
              icon={<Network className="size-5" />}
              title="Neo4j"
              description="Builds the transaction graph, supports multi-hop neighborhoods, and powers directed trace paths."
            />
            <StoryCard
              icon={<Binary className="size-5" />}
              title="pgvector"
              description="Supports nearest-neighbor similarity for account behavior and contract bytecode fingerprints."
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <StoryCard
            icon={<Compass className="size-5" />}
            title="Overview"
            description="Start with network movement, recent forensic flags, and recent transactions backed by PostgreSQL aggregates."
          />
          <StoryCard
            icon={<Network className="size-5" />}
            title="Graph Workspace"
            description="Move from an address into Neo4j-powered neighborhood tracing and bounded hop-by-hop paths."
          />
          <StoryCard
            icon={<FileCode2 className="size-5" />}
            title="Contracts"
            description="Review contract addresses, bytecode, and pgvector similarity without overwhelming the main workflow."
          />
        </section>
      </div>
    </div>
  );
}
