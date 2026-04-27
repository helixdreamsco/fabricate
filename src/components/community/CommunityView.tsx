"use client";
import * as React from "react";
import Link from "next/link";
import { Copy, Check, Settings, LogOut } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { CommunityAvatar } from "./CommunityAvatar";
import { PolicyBadges } from "./PolicyBadges";
import { CommunityChat } from "./CommunityChat";
import type { CommunityFull, CommunityMakerSummary } from "@/lib/community-types";

export function CommunityView({
  community,
  communityMakers,
  meUserId,
}: {
  community: CommunityFull;
  communityMakers: CommunityMakerSummary[];
  meUserId: string;
}) {
  const isOwner = community.ownerId === meUserId;

  return (
    <div className="flex-1 flex flex-col bg-grid-none min-h-0">
      {/* Header */}
      <div className="border-b border-black/[0.06] bg-white">
        <div className="max-w-[1600px] w-full mx-auto px-5 md:px-8 py-5 flex items-start md:items-center gap-4 flex-wrap">
          <CommunityAvatar
            name={community.name}
            hue={community.iconHue}
            size={56}
          />
          <div className="flex-1 min-w-0">
            <MonoLabel size="sm" className="mb-0.5">
              Community · {community.memberCount}{" "}
              {community.memberCount === 1 ? "member" : "members"}
            </MonoLabel>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight truncate">
              {community.name}
            </h1>
            {community.description ? (
              <p className="text-sm font-light text-black/60 mt-1 max-w-2xl">
                {community.description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <PolicyBadges policy={community} />
          </div>
          {isOwner ? (
            <Link href={`/c/${community.slug}/settings`}>
              <Button
                size="sm"
                variant="secondary"
                startIcon={<Settings className="w-3 h-3 mr-1" />}
              >
                Settings
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Workbench: makers | chat | members */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto px-5 md:px-8 py-5 grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,280px)] gap-4 min-h-0">
        {/* Makers — auto-derived from members who have a MakerProfile. No
            owner-pick step. */}
        <MakersSidebar makers={communityMakers} />

        {/* Chat */}
        <div className="flex flex-col min-h-[60vh] lg:min-h-0">
          <CommunityChat
            communityId={community.id}
            meUserId={meUserId}
          />
        </div>

        {/* Members & invite */}
        <MembersSidebar
          community={community}
          meUserId={meUserId}
        />
      </div>
    </div>
  );
}

function MakersSidebar({ makers }: { makers: CommunityMakerSummary[] }) {
  return (
    <Card className="flex flex-col min-h-[40vh] lg:min-h-0">
      <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between">
        <MonoLabel size="md" className="!text-black">
          Makers in this community · {makers.length}
        </MonoLabel>
      </div>
      <div className="flex-1 overflow-y-auto">
        {makers.length === 0 ? (
          <div className="p-6 text-center">
            <MonoLabel size="md" className="mb-2 block">
              No makers yet
            </MonoLabel>
            <p className="text-[12px] font-light text-black/55 leading-relaxed">
              When members sign up as makers, they appear here automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {makers.map((m) => (
              <li key={m.id} className="px-4 py-3 flex items-start gap-3">
                <StatusDot
                  tone={m.stripeOnboarded ? "ready" : "offline"}
                  pulse={m.stripeOnboarded}
                  className="mt-1.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {m.displayName}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-black/50 mt-0.5 truncate">
                    {[m.printerModel, m.postcode].filter(Boolean).join(" · ") || "Maker"}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.hasAMS ? (
                      <span className="font-mono text-[8px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
                        AMS
                      </span>
                    ) : null}
                    {m.freeCompletionPhoto ? (
                      <span className="font-mono text-[8px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                        Free photo
                      </span>
                    ) : null}
                    {!m.stripeOnboarded ? (
                      <span className="font-mono text-[8px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded-full bg-black/[0.04] text-black/45">
                        Not yet onboarded
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function MembersSidebar({
  community,
  meUserId,
}: {
  community: CommunityFull;
  meUserId: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState<string>("");

  React.useEffect(() => {
    // Compose from window so the URL matches whatever origin the user is on.
    setInviteUrl(`${window.location.origin}/j/${community.inviteCode}`);
  }, [community.inviteCode]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select in an input (skipped for brevity).
    }
  };

  const leave = async () => {
    if (!confirm("Leave this community?")) return;
    setLeaving(true);
    const res = await fetch(`/api/communities/${community.id}/leave`, {
      method: "POST",
    });
    if (res.ok) {
      window.location.href = "/communities";
    } else {
      setLeaving(false);
    }
  };

  return (
    <Card className="flex flex-col min-h-[40vh] lg:min-h-0">
      <div className="px-4 py-3 border-b border-black/[0.06]">
        <MonoLabel size="md" className="!text-black">
          Invite link
        </MonoLabel>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-black/10 bg-[#fafafa] px-3 py-2">
          <span className="font-mono text-[11px] tabular-nums truncate flex-1 text-black/70">
            {inviteUrl || `/j/${community.inviteCode}`}
          </span>
          <button
            onClick={copyInvite}
            className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-black/60 hover:text-black transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-black/[0.06]">
        <MonoLabel size="md" className="!text-black">
          Members · {community.memberCount}
        </MonoLabel>
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-black/[0.06]">
        {community.members.map((m) => {
          const initial = (m.name ?? m.email ?? "?").charAt(0).toUpperCase();
          const isMe = m.userId === meUserId;
          return (
            <li key={m.userId} className="px-4 py-2.5 flex items-center gap-3">
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image}
                  alt={m.name ?? m.email ?? "member"}
                  className="w-7 h-7 rounded-full border border-black/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-7 h-7 rounded-full bg-[#0a0a0a] text-white text-[10px] font-bold flex items-center justify-center">
                  {initial}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.name ?? m.email ?? "Member"}
                  {isMe ? (
                    <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
                      you
                    </span>
                  ) : null}
                </div>
              </div>
              {m.role !== "member" ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/50">
                  {m.role}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {community.ownerId !== meUserId ? (
        <div className="px-4 py-3 border-t border-black/[0.06]">
          <button
            onClick={leave}
            disabled={leaving}
            className="w-full inline-flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/55 hover:text-[#ef4444] transition-colors"
          >
            <LogOut className="w-3 h-3" />
            {leaving ? "Leaving…" : "Leave community"}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
