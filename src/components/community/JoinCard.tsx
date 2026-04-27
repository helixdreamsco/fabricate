"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { CommunityAvatar } from "./CommunityAvatar";
import { PolicyBadges } from "./PolicyBadges";
import type { InvitePreview } from "@/lib/community-types";

export function JoinCard({
  preview,
  signedIn,
}: {
  preview: InvitePreview;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const join = async () => {
    if (!signedIn) {
      router.push(
        `/account?callbackUrl=${encodeURIComponent(
          `/j/${preview.inviteCode}`,
        )}`,
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${preview.inviteCode}/join`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      router.push(`/c/${preview.slug}`);
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  };

  return (
    <div className="flex-1 bg-grid-none flex items-center justify-center py-16">
      <div className="w-full max-w-md px-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors mb-6"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Fabricate
        </Link>

        <Card className="p-8 flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <CommunityAvatar
              name={preview.name}
              hue={preview.iconHue}
              size={64}
            />
            <div className="flex-1 min-w-0">
              <MonoLabel size="sm" className="mb-0.5">
                You&rsquo;re invited to
              </MonoLabel>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight truncate">
                {preview.name}
              </h1>
              <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mt-1">
                <Users2 className="w-3 h-3" />
                {preview.memberCount}{" "}
                {preview.memberCount === 1 ? "member" : "members"}
              </div>
            </div>
          </div>

          {preview.description ? (
            <p className="text-sm font-light text-black/65 leading-relaxed">
              {preview.description}
            </p>
          ) : null}

          <PolicyBadges
            policy={{
              discountPct: preview.discountPct,
              freeMode: preview.freeMode,
              priorityQueue: preview.priorityQueue,
              memberOnlyMakers: false,
            }}
          />

          {preview.ownerName ? (
            <div className="pt-4 border-t border-black/[0.06] flex items-center gap-3">
              {preview.ownerImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.ownerImage}
                  alt={preview.ownerName}
                  className="w-8 h-8 rounded-full border border-black/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-[#0a0a0a] text-white text-[11px] font-bold flex items-center justify-center">
                  {preview.ownerName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-mono uppercase tracking-[0.18em] text-black/45">
                  Hosted by
                </span>
                <span className="text-sm font-semibold">
                  {preview.ownerName}
                </span>
              </div>
            </div>
          ) : null}

          <div className="pt-2">
            {preview.alreadyMember ? (
              <Button
                size="lg"
                withArrow
                onClick={() => router.push(`/c/${preview.slug}`)}
                className="w-full justify-between"
              >
                Open community
              </Button>
            ) : (
              <Button
                size="lg"
                withArrow
                onClick={join}
                disabled={pending}
                className="w-full justify-between"
              >
                {pending
                  ? "Joining…"
                  : signedIn
                    ? "Accept & join"
                    : "Sign in to join"}
              </Button>
            )}
            {error ? (
              <div className="mt-3 text-[12px] font-mono text-[#ef4444]">
                {error}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
