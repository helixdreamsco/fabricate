import { prisma } from "./prisma";
import { bus } from "./events";
import { Resend } from "resend";

export type NotifKind =
  | "bid_placed"
  | "bid_accepted"
  | "message_received"
  | "status_change"
  | "pickup_minted"
  | "dispute_filed"
  | "dispute_resolved"
  | "refund_issued"
  | "review_submitted"
  | "review_revealed"
  | "maker_verified"
  | "verification_rejected";

const MESSAGE_EMAIL_THROTTLE_MS = 30 * 60 * 1000; // 30 min

const FROM = process.env.RESEND_FROM ?? "Fabricate <noreply@fabricate.dev>";
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

let cachedResend: Resend | null = null;
function resendClient(): Resend | null {
  if (cachedResend) return cachedResend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedResend = new Resend(key);
  return cachedResend;
}

type Prefs = Partial<Record<NotifKind, { email?: boolean; inApp?: boolean }>>;

async function getPrefs(userId: string): Promise<Prefs> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return {};
  try {
    return JSON.parse(row.prefs) as Prefs;
  } catch {
    return {};
  }
}

/**
 * Persist a notification, broadcast to SSE subscribers, and (if email is
 * enabled) send an email. Email throttling applies to message_received
 * (max 1 email per recipient per 30 min).
 */
export async function notify(opts: {
  recipientId: string;
  kind: NotifKind;
  body: string;
  link?: string;
  data?: unknown;
  emailSubject?: string;
  emailHtml?: string;
}): Promise<void> {
  const prefs = await getPrefs(opts.recipientId);
  const kindPref = prefs[opts.kind] ?? {};
  const inAppEnabled = kindPref.inApp !== false;
  const emailEnabled = kindPref.email !== false;

  if (inAppEnabled) {
    const dataStr = opts.data != null ? JSON.stringify(opts.data) : null;
    const notif = await prisma.notification.create({
      data: {
        recipientId: opts.recipientId,
        kind: opts.kind,
        body: opts.body,
        link: opts.link ?? null,
        data: dataStr,
      },
    });
    bus.emit(`notif:${opts.recipientId}`, {
      type: "notification:new",
      notification: {
        id: notif.id,
        kind: notif.kind,
        body: notif.body,
        link: notif.link,
        createdAt: notif.createdAt.toISOString(),
        readAt: null,
      },
    });
  }

  if (!emailEnabled) return;

  if (opts.kind === "message_received") {
    const recent = await prisma.notification.findFirst({
      where: {
        recipientId: opts.recipientId,
        kind: "message_received",
        createdAt: { gte: new Date(Date.now() - MESSAGE_EMAIL_THROTTLE_MS) },
        // throttled flag stored on data — first email sets data.emailed=true
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent && recent.data) {
      try {
        const d = JSON.parse(recent.data) as { emailed?: boolean };
        if (d.emailed) return;
      } catch {
        // continue
      }
    }
  }

  const recipient = await prisma.user.findUnique({
    where: { id: opts.recipientId },
    select: { email: true },
  });
  if (!recipient?.email) return;

  const client = resendClient();
  if (!client) return; // no API key — skip email silently

  const subject = opts.emailSubject ?? defaultSubject(opts.kind);
  const html = opts.emailHtml ?? defaultHtml(opts.body, opts.link);

  try {
    const resp = await client.emails.send({
      from: FROM,
      to: recipient.email,
      subject,
      html,
    });
    // Resend's SDK returns errors in the body, not via throw — surface them
    // so a silent rejection (e.g. unverified sender, blocked recipient)
    // shows up in logs.
    if (resp?.error) {
      console.error(
        "[notify] resend rejected",
        { to: recipient.email, subject, error: resp.error },
      );
    }
  } catch (err) {
    console.error("[notify] email send failed", err);
  }
}

function defaultSubject(kind: NotifKind): string {
  switch (kind) {
    case "bid_placed":      return "New bid on your job";
    case "bid_accepted":    return "Your bid was accepted";
    case "message_received":return "New message on Fabricate";
    case "status_change":   return "Job status updated";
    case "pickup_minted":   return "Your part is ready for pickup";
    case "dispute_filed":   return "A dispute was opened on your job";
    case "dispute_resolved":return "Your dispute has been resolved";
    case "refund_issued":   return "A refund was issued";
    case "review_submitted":return "A review was submitted";
    case "review_revealed": return "Reviews are now public";
    case "maker_verified":  return "Maker verification approved";
    case "verification_rejected": return "Maker verification needs changes";
  }
}

function defaultHtml(body: string, link?: string): string {
  const safeLink = link ? `${APP_BASE}${link}` : APP_BASE;
  return `<div style="font-family: -apple-system, system-ui, sans-serif; padding: 16px;">
    <p style="font-size:15px; color:#111;">${escapeHtml(body)}</p>
    <p><a href="${safeLink}" style="display:inline-block; margin-top:12px; padding:10px 14px; background:#0a0a0a; color:#fff; text-decoration:none; border-radius:8px; font-family:monospace; font-size:11px; letter-spacing:.18em; text-transform:uppercase;">Open Fabricate</a></p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
