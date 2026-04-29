import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NotificationPreferencesForm } from "./NotificationPreferencesForm";

export const dynamic = "force-dynamic";

const KIND_LABELS: { kind: string; label: string; description: string }[] = [
  { kind: "bid_placed", label: "Bid placed on your job", description: "A maker has bid on a job you posted." },
  { kind: "bid_accepted", label: "Your bid was accepted", description: "A creator chose your bid for their job." },
  { kind: "message_received", label: "New message", description: "Chat or dispute message from the other party (email throttled to 1 per 30 min)." },
  { kind: "status_change", label: "Job status changed", description: "Status transitions like in-progress or ready for pickup." },
  { kind: "pickup_minted", label: "Pickup ready", description: "Your part is ready, with a QR token to collect." },
  { kind: "dispute_filed", label: "Dispute filed", description: "A dispute was opened on your job." },
  { kind: "dispute_resolved", label: "Dispute resolved", description: "An admin has decided a dispute outcome." },
  { kind: "refund_issued", label: "Refund issued", description: "A refund was issued on your payment." },
  { kind: "review_submitted", label: "Review submitted", description: "Someone submitted a review of you (hidden until reveal)." },
  { kind: "review_revealed", label: "Reviews now public", description: "Mutual reviews are now visible to both parties." },
  { kind: "maker_verified", label: "Maker verification approved", description: "Your verification was approved." },
  { kind: "verification_rejected", label: "Verification needs changes", description: "Your verification submission needs an update." },
];

export default async function NotificationPreferencesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/account/notifications");
  const row = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });
  let prefs: Record<string, { email?: boolean; inApp?: boolean }> = {};
  if (row?.prefs) {
    try {
      prefs = JSON.parse(row.prefs);
    } catch {
      prefs = {};
    }
  }

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-2">
          Account · Notifications
        </div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Notification preferences
        </h1>
        <p className="text-sm font-light text-black/65 mb-6 leading-relaxed">
          In-app notifications appear in the bell at the top right. Email
          notifications also send to your account email. Defaults are on for
          every category.
        </p>

        <NotificationPreferencesForm
          initialPrefs={prefs}
          kinds={KIND_LABELS}
        />
      </div>
    </div>
  );
}
