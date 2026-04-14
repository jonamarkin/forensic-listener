"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("analyst@forensic.local");
  const [password, setPassword] = useState("demo-access");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    window.setTimeout(() => {
      router.push("/overview");
    }, 320);
  }

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1360px] gap-6 xl:grid-cols-[minmax(0,1.08fr)_420px]">
        <Card className="overflow-hidden border-none bg-[linear-gradient(135deg,#17361d_0%,#234c29_54%,#8db979_100%)] text-white shadow-[0_28px_80px_rgba(18,41,23,0.18)]">
          <CardContent className="relative flex h-full flex-col justify-between gap-8 p-7 sm:p-8 lg:p-10">
            <div className="absolute inset-0 opacity-18">
              <div className="absolute -left-8 top-8 h-32 w-32 rounded-[28px] bg-white/10 rotate-12" />
              <div className="absolute left-28 top-26 h-16 w-16 rounded-[20px] bg-white/10 rotate-12" />
              <div className="absolute right-8 bottom-10 h-36 w-36 rounded-[34px] bg-[#d1e6c3]/14 rotate-12" />
            </div>

            <div className="relative space-y-5">
              <Badge className="border-white/18 bg-white/12 text-white">
                Workspace Access
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                  Sign in to the investigation workspace.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-white/78 sm:text-base">
                  Continue to the forensic analysis environment.
                </p>
              </div>
            </div>

            <div className="relative grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/14 bg-white/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                  Overview
                </div>
                <div className="mt-2 text-sm text-white/82">
                  Network metrics, recent transactions, and current forensic flags.
                </div>
              </div>
              <div className="rounded-[24px] border border-white/14 bg-white/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                  Graph
                </div>
                <div className="mt-2 text-sm text-white/82">
                  Neo4j neighborhoods, hops, hubs, and bounded transaction traces.
                </div>
              </div>
              <div className="rounded-[24px] border border-white/14 bg-white/10 p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                  Similarity
                </div>
                <div className="mt-2 text-sm text-white/82">
                  pgvector matching for account behavior and contract bytecode.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="self-center bg-[linear-gradient(180deg,rgba(252,253,249,0.99),rgba(246,248,242,0.97))]">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-2 text-[#2b6631]">
              <ShieldCheck className="size-5" />
              <CardTitle className="text-[#132118]">Workspace login</CardTitle>
            </div>
            <CardDescription>Enter your credentials to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-[#223026]">
                  <Mail className="size-4 text-[#2b6631]" />
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="analyst@forensic.local"
                  autoComplete="email"
                />
              </label>

              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium text-[#223026]">
                  <LockKeyhole className="size-4 text-[#2b6631]" />
                  Password
                </span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="demo-access"
                  autoComplete="current-password"
                />
              </label>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Entering workspace..." : "Enter workspace"}
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="flex-1">
                <Link href="/">Back to landing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
