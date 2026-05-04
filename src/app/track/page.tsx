"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { useOrder } from "@/lib/order-store";

export default function TrackPage() {
  const router = useRouter();
  const { draft } = useOrder();
  const [orderId, setOrderId] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = orderId.trim();
    if (!id) return;
    router.push(`/order/${id.toUpperCase()}`);
  };

  const hasActive = draft.analysis !== null;

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[1000px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <MonoLabel size="md" className="mb-6 block">
          Track an order
        </MonoLabel>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.0] mb-10">
          <span className="shimmer-text">Where is my part?</span>
        </h1>

        <Card className="p-8 md:p-10 mb-10">
          <form onSubmit={submit} className="flex flex-col gap-6">
            <label className="flex flex-col gap-3">
              <MonoLabel size="md">Order number</MonoLabel>
              <Input
                mono
                required
                placeholder="FB-0424-A3F9"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
              />
            </label>
            <div className="flex items-center justify-between">
              <MonoLabel size="sm">
                Check your email receipt for the ID
              </MonoLabel>
              <Button type="submit" size="lg" withArrow>
                Track
              </Button>
            </div>
          </form>
        </Card>

        {hasActive ? (
          <Card className="p-6 md:p-8">
            <div className="flex items-start justify-between mb-3">
              <div>
                <MonoLabel size="md" className="mb-2 block">
                  Active session
                </MonoLabel>
                <h3 className="text-xl font-black tracking-tight">
                  You have an in-progress print
                </h3>
              </div>
              <StatusDot tone="printing" pulse />
            </div>
            <p className="text-sm font-light text-black/60 max-w-xl leading-relaxed">
              {draft.analysis?.fileName} — {draft.material} ·{" "}
              {draft.quantity}×{draft.maker ? ` · ${draft.maker.name}` : ""}
            </p>
            <div className="mt-4">
              <Link
                href="/configure"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#0a0a0a] hover:underline"
              >
                Continue configuring →
              </Link>
            </div>
          </Card>
        ) : null}

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Fabricate
          </Link>
        </div>
      </div>
    </div>
  );
}
