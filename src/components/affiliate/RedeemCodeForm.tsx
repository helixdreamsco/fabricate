"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-black/[0.10] bg-white text-sm font-light placeholder:text-black/35 focus:border-black/40 focus:outline-none font-mono uppercase tracking-widest";

const errorMessage: Record<string, string> = {
  invalid_format:
    "Codes are 4–32 characters: letters, numbers, dashes or underscores.",
  not_found: "We don't recognise that code.",
  self: "You can't redeem your own code.",
  already_redeemed:
    "You already have a code on your account. Only one per user.",
  unauthorized: "Sign in first.",
  invalid_body: "Something went wrong — try again.",
};

export function RedeemCodeForm({ justRedeemed }: { justRedeemed: boolean }) {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/affiliate/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const reason = typeof j?.error === "string" ? j.error : "invalid_body";
        throw new Error(errorMessage[reason] ?? "That didn't work.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {justRedeemed ? (
        <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-[12px] font-light text-emerald-900">
          Code linked. The waiver fires on your first paid job.
        </div>
      ) : null}
      <input
        type="text"
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="NOFEES-FRIEND"
        className={inputCls}
        maxLength={48}
      />
      {error ? (
        <div className="text-[12px] text-red-700 font-light leading-snug">
          {error}
        </div>
      ) : null}
      <Button
        type="submit"
        size="md"
        disabled={pending || !code.trim()}
        className="w-full justify-center disabled:opacity-50"
      >
        {pending ? "Linking…" : "Redeem"}
      </Button>
      <p className="text-[11px] font-light text-black/45 leading-snug">
        One affiliate code per user, ever. Choose wisely.
      </p>
    </form>
  );
}
