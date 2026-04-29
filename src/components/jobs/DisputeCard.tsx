import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getLatestDispute } from "@/lib/disputes";
import { DisputeFileButton } from "./DisputeFileButton";
import { DisputeThread } from "./DisputeThread";

/**
 * Server component. Three states:
 *   1. No dispute yet, status disputable → show "Report an issue" button
 *      (creator only).
 *   2. Open dispute → show full thread + reply box (both parties).
 *   3. Resolved dispute → show summary + outcome.
 */
export async function DisputeCard({
  jobId,
  jobStatus,
  viewerId,
  isCreator,
  isMaker,
}: {
  jobId: string;
  jobStatus: string;
  viewerId: string;
  isCreator: boolean;
  isMaker: boolean;
}) {
  const dispute = await getLatestDispute(jobId);

  if (!dispute) {
    if (!isCreator) return null;
    const allowed = ["ASSIGNED", "IN_PROGRESS", "READY_FOR_PICKUP", "PICKED_UP"].includes(jobStatus);
    if (!allowed) return null;
    return (
      <Card className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Issue with this order?
        </div>
        <p className="text-sm font-light text-black/70 leading-relaxed">
          If something has gone wrong — print failed, part doesn&rsquo;t
          match the design, maker has gone silent — open a dispute. We hold
          the payment until it&rsquo;s resolved.
        </p>
        <DisputeFileButton jobId={jobId} />
      </Card>
    );
  }

  const isOpen = dispute.status === "OPEN";
  const outcome =
    dispute.status === "RESOLVED_CREATOR"
      ? "creator"
      : dispute.status === "RESOLVED_MAKER"
        ? "maker"
        : null;

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
          Dispute
        </div>
        <Pill open={isOpen} outcome={outcome} />
      </div>

      <div className="rounded-lg border border-black/[0.08] bg-amber-50/40 p-3 mb-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" strokeWidth={2.2} />
          <div className="text-sm font-light text-black/75 leading-relaxed">
            <span className="font-medium">{dispute.filedBy.name ?? dispute.filedBy.email ?? "Creator"}</span> opened this dispute.
            <div className="mt-1 italic text-black/65 whitespace-pre-wrap">{dispute.reason}</div>
          </div>
        </div>
      </div>

      {dispute.resolvedAt ? (
        <div className="rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2.5 mb-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1">
            Resolved {new Date(dispute.resolvedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
          </div>
          <div className="text-sm font-light text-black/75">
            Outcome: <span className="font-medium">{outcome === "creator" ? "Creator wins (refund issued)" : "Maker wins (job completed)"}</span>
          </div>
          {dispute.resolutionNote ? (
            <div className="text-sm font-light text-black/65 italic mt-1">
              {dispute.resolutionNote}
            </div>
          ) : null}
        </div>
      ) : null}

      <DisputeThread
        jobId={jobId}
        disputeId={dispute.id}
        canReply={isOpen && (isCreator || isMaker)}
        viewerId={viewerId}
        messages={dispute.messages.map((m) => ({
          id: m.id,
          authorId: m.authorId,
          authorName: m.author.name ?? m.author.email ?? "User",
          body: m.body,
          evidenceUrl: m.evidenceUrl,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </Card>
  );
}

function Pill({
  open,
  outcome,
}: {
  open: boolean;
  outcome: "creator" | "maker" | null;
}) {
  if (open) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] bg-amber-500/10 text-amber-800 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
        Open
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono uppercase tracking-[0.16em] text-[10px] bg-black/[0.04] text-black/55 border border-black/[0.08]">
      <span className="w-1.5 h-1.5 rounded-full bg-black/30" />
      Resolved · {outcome === "creator" ? "creator won" : "maker won"}
    </span>
  );
}
