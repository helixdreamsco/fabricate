/**
 * Email notification adapter + per-event helpers.
 *
 * Live mode: uses Resend if `RESEND_API_KEY` is set.
 * Dev mode:  logs a one-line summary to the server console — same call sites
 *            work either way, so the trigger points in API routes don't
 *            branch.
 *
 * All helpers fire-and-forget by design (wrapped in `safe(...)` below) — a
 * flaky email provider must never break the underlying job action. Errors
 * are logged but swallowed.
 */

import { Resend } from "resend";
import { formatGbp } from "./money";

// ── core ───────────────────────────────────────────────────────────────────

const _resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "Fabricate <onboarding@resend.dev>";

function appUrl(): string {
  return (
    process.env.APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? "http://localhost:3000"
  );
}

export function jobUrl(jobId: string): string {
  return `${appUrl()}/jobs/${jobId}`;
}
export function makerJobUrl(jobId: string): string {
  return `${appUrl()}/maker/jobs/${jobId}`;
}

type SendOpts = {
  to: string | null | undefined;
  subject: string;
  /** Plain-text fallback. */
  text: string;
  /** HTML body — wrapped automatically with the shell template. */
  html: string;
};

/** Top-level email send. Returns void; never throws. */
async function sendEmail(opts: SendOpts): Promise<void> {
  if (!opts.to) return;
  const wrapped = wrapHtml(opts.html);
  if (!_resend) {
    // Dev mode — one log line so the trigger is visible in the dev server
    // output without dumping the full HTML body.
    // eslint-disable-next-line no-console
    console.log(
      `[email DRY RUN] to=${opts.to} subject=${JSON.stringify(opts.subject)}`,
    );
    return;
  }
  try {
    await _resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: wrapped,
      text: opts.text,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email] send failed", e);
  }
}

/** Run a notification helper; never throw, never block. */
function safe(p: Promise<void>): void {
  p.catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[notifications] helper failed", e);
  });
}

// ── HTML helpers ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0a0a0a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid rgba(0,0,0,0.06);font-family:'Space Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#0a0a0a;font-weight:700">
      Fabricate
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.55">
      ${inner}
    </div>
    <div style="padding:14px 24px;border-top:1px solid rgba(0,0,0,0.06);font-family:'Space Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(0,0,0,0.4)">
      You're receiving this because you're part of a Fabricate job.
    </div>
  </div>
</body></html>`;
}

function ctaButton(label: string, href: string): string {
  return `<p style="margin:24px 0 8px"><a href="${href}" style="display:inline-block;background:#0a0a0a;color:#ffffff;padding:12px 22px;border-radius:9999px;font-family:'Space Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;text-decoration:none">${label}</a></p>`;
}

function quoteBlock(text: string): string {
  return `<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid rgba(0,0,0,0.15);background:rgba(0,0,0,0.03);font-style:italic;color:rgba(0,0,0,0.7)">${escapeHtml(text)}</blockquote>`;
}

// ── per-event helpers ──────────────────────────────────────────────────────

export function notifyJobPrioritized(args: {
  makerEmail: string | null;
  makerDisplayName: string;
  creatorName: string;
  jobId: string;
  fileName: string;
  quotedPricePence: number;
}): void {
  safe(sendEmail({
    to: args.makerEmail,
    subject: `${args.creatorName} prioritized you for a Fabricate job`,
    text:
      `${args.creatorName} just posted "${args.fileName}" and prioritized your account.\n` +
      `Quoted price: ${formatGbp(args.quotedPricePence)}.\n` +
      `View it: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.makerDisplayName)},</p>
       <p><strong>${escapeHtml(args.creatorName)}</strong> just posted a Fabricate job and picked your profile as the prioritized maker.</p>
       <p style="margin:16px 0;font-family:'Space Mono',ui-monospace,monospace;font-size:13px">
         <strong>${escapeHtml(args.fileName)}</strong> · ${formatGbp(args.quotedPricePence)}
       </p>
       <p>The job is open to everyone, so grab it quickly if you want it.</p>
       ${ctaButton("View & accept", jobUrl(args.jobId))}`,
  }));
}

export function notifyBidPlaced(args: {
  creatorEmail: string | null;
  creatorName: string;
  jobId: string;
  fileName: string;
  makerName: string;
  priceOfferPence: number;
  etaHours: number;
  message: string | null;
  bidsCountAfter: number;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `New bid · ${formatGbp(args.priceOfferPence)} on "${args.fileName}"`,
    text:
      `${args.makerName} placed a bid: ${formatGbp(args.priceOfferPence)}, ETA ${args.etaHours}h.\n` +
      (args.message ? `Message: ${args.message}\n` : "") +
      `View bid: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p><strong>${escapeHtml(args.makerName)}</strong> placed a bid on your job <strong>${escapeHtml(args.fileName)}</strong>.</p>
       <p style="margin:16px 0;font-family:'Space Mono',ui-monospace,monospace;font-size:14px">
         <strong>${formatGbp(args.priceOfferPence)}</strong> · ETA ${args.etaHours}h
       </p>
       ${args.message ? quoteBlock(args.message) : ""}
       <p>You now have ${args.bidsCountAfter} bid${args.bidsCountAfter === 1 ? "" : "s"} to choose from.</p>
       ${ctaButton("Review bids", jobUrl(args.jobId))}`,
  }));
}

export function notifyBidWithdrawn(args: {
  creatorEmail: string | null;
  creatorName: string;
  jobId: string;
  fileName: string;
  makerName: string;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `${args.makerName} withdrew their bid`,
    text:
      `${args.makerName} pulled their bid from "${args.fileName}".\n` +
      `View other bids: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p><strong>${escapeHtml(args.makerName)}</strong> withdrew their bid on <strong>${escapeHtml(args.fileName)}</strong>.</p>
       <p>Other makers may still be bidding.</p>
       ${ctaButton("View job", jobUrl(args.jobId))}`,
  }));
}

export function notifyBidAccepted(args: {
  makerEmail: string | null;
  makerDisplayName: string;
  jobId: string;
  fileName: string;
  creatorName: string;
  priceOfferPence: number;
  etaHours: number;
}): void {
  safe(sendEmail({
    to: args.makerEmail,
    subject: `Your bid was accepted — start "${args.fileName}"`,
    text:
      `${args.creatorName} accepted your bid (${formatGbp(args.priceOfferPence)}, ETA ${args.etaHours}h).\n` +
      `Manage the job: ${makerJobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.makerDisplayName)},</p>
       <p><strong>${escapeHtml(args.creatorName)}</strong> accepted your bid on <strong>${escapeHtml(args.fileName)}</strong>.</p>
       <p style="margin:16px 0;font-family:'Space Mono',ui-monospace,monospace;font-size:14px">
         <strong>${formatGbp(args.priceOfferPence)}</strong> · ETA ${args.etaHours}h
       </p>
       <p>Payment is captured and held by Fabricate. It releases to you the moment pickup is verified.</p>
       ${ctaButton("Open job & start", makerJobUrl(args.jobId))}`,
  }));
}

export function notifyBidDeclined(args: {
  makerEmail: string | null;
  makerDisplayName: string;
  jobId: string;
  fileName: string;
  creatorName: string;
}): void {
  safe(sendEmail({
    to: args.makerEmail,
    subject: `"${args.fileName}" went to another maker`,
    text:
      `${args.creatorName} picked another bid for "${args.fileName}". Plenty more in the market.\n` +
      `Browse: ${appUrl()}/market`,
    html:
      `<p>Hey ${escapeHtml(args.makerDisplayName)},</p>
       <p>${escapeHtml(args.creatorName)} accepted another bid on <strong>${escapeHtml(args.fileName)}</strong>. No hard feelings — plenty of other open jobs.</p>
       ${ctaButton("Browse market", `${appUrl()}/market`)}`,
  }));
}

export function notifyJobInProgress(args: {
  creatorEmail: string | null;
  creatorName: string;
  jobId: string;
  fileName: string;
  makerName: string;
  etaHours: number | null;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `${args.makerName} started printing "${args.fileName}"`,
    text:
      `${args.makerName} marked your job as in progress.\n` +
      (args.etaHours ? `ETA: ~${args.etaHours}h.\n` : "") +
      `Watch progress: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p><strong>${escapeHtml(args.makerName)}</strong> started printing <strong>${escapeHtml(args.fileName)}</strong>.</p>
       ${args.etaHours ? `<p style="font-family:'Space Mono',ui-monospace,monospace;font-size:13px">ETA: ~${args.etaHours}h</p>` : ""}
       ${ctaButton("Watch progress", jobUrl(args.jobId))}`,
  }));
}

export function notifyCompletionPhotoUploaded(args: {
  creatorEmail: string | null;
  creatorName: string;
  jobId: string;
  fileName: string;
  makerName: string;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `${args.makerName} uploaded a completion photo`,
    text:
      `${args.makerName} attached a completion photo to "${args.fileName}". ` +
      `View: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p><strong>${escapeHtml(args.makerName)}</strong> uploaded the completion photo you requested for <strong>${escapeHtml(args.fileName)}</strong>.</p>
       <p>Have a look — if it's not what you expected, message them in chat. Otherwise they'll mark it ready for pickup next.</p>
       ${ctaButton("View photo", jobUrl(args.jobId))}`,
  }));
}

export function notifyJobReadyForPickup(args: {
  creatorEmail: string | null;
  creatorName: string;
  jobId: string;
  fileName: string;
  makerName: string;
  makerPostcode: string | null;
  pickupCode: string;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `Ready to collect — "${args.fileName}"`,
    text:
      `${args.makerName} marked your print as ready for pickup.\n` +
      (args.makerPostcode ? `Pickup at ${args.makerPostcode}.\n` : "") +
      `Your pickup code: ${args.pickupCode}\n` +
      `View: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p>Your print <strong>${escapeHtml(args.fileName)}</strong> is ready. Head to <strong>${escapeHtml(args.makerName)}</strong>${args.makerPostcode ? ` at ${escapeHtml(args.makerPostcode)}` : ""} to collect.</p>
       <p style="margin:18px 0;font-family:'Space Mono',ui-monospace,monospace;font-size:24px;letter-spacing:0.3em;text-align:center;background:rgba(0,0,0,0.04);padding:16px;border-radius:10px">
         ${args.pickupCode.slice(0, 3)} ${args.pickupCode.slice(3)}
       </p>
       <p style="font-size:13px;color:rgba(0,0,0,0.55)">Show the QR (in-app) or read out this code at handover. Single-use; expires in 2h.</p>
       ${ctaButton("Open pickup screen", jobUrl(args.jobId))}`,
  }));
}

export function notifyPickupVerified(args: {
  creatorEmail: string | null;
  creatorName: string;
  makerEmail: string | null;
  makerDisplayName: string;
  jobId: string;
  fileName: string;
  payoutAmountPence: number;
}): void {
  safe(sendEmail({
    to: args.creatorEmail,
    subject: `Pickup confirmed — "${args.fileName}"`,
    text:
      `Pickup is verified. Funds released to ${args.makerDisplayName}. Job complete.\n` +
      `View receipt: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.creatorName)},</p>
       <p>You've collected <strong>${escapeHtml(args.fileName)}</strong>. Funds are released to ${escapeHtml(args.makerDisplayName)} and the job is complete.</p>
       ${ctaButton("View receipt", jobUrl(args.jobId))}`,
  }));
  safe(sendEmail({
    to: args.makerEmail,
    subject: `Payout released · ${formatGbp(args.payoutAmountPence)}`,
    text:
      `${args.creatorName} confirmed pickup of "${args.fileName}".\n` +
      `Payout: ${formatGbp(args.payoutAmountPence)}.\n` +
      `View: ${makerJobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.makerDisplayName)},</p>
       <p>${escapeHtml(args.creatorName)} confirmed pickup of <strong>${escapeHtml(args.fileName)}</strong>.</p>
       <p style="margin:16px 0;font-family:'Space Mono',ui-monospace,monospace;font-size:18px">
         Payout: <strong>${formatGbp(args.payoutAmountPence)}</strong>
       </p>
       <p>It's in your Stripe Connect balance and will arrive on your usual payout schedule.</p>
       ${ctaButton("View payout", `${appUrl()}/maker/payouts`)}`,
  }));
}

export function notifyJobCancelled(args: {
  recipientEmail: string | null;
  recipientName: string;
  jobId: string;
  fileName: string;
  byParty: "creator" | "maker";
  refunded: boolean;
}): void {
  const byLabel = args.byParty === "creator" ? "the creator" : "the maker";
  safe(sendEmail({
    to: args.recipientEmail,
    subject: `Job cancelled — "${args.fileName}"`,
    text:
      `${byLabel} cancelled the job.\n` +
      (args.refunded ? "Any captured payment has been refunded.\n" : "") +
      `View: ${jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.recipientName)},</p>
       <p><strong>${escapeHtml(args.fileName)}</strong> was cancelled by ${byLabel}.</p>
       ${args.refunded ? "<p>Any captured payment has been refunded.</p>" : ""}
       ${ctaButton("View job", jobUrl(args.jobId))}`,
  }));
}

export function notifyIssueReported(args: {
  recipientEmail: string | null;
  recipientName: string;
  jobId: string;
  fileName: string;
  byParty: "creator" | "maker";
  body: string;
  isMaker: boolean; // true if recipient is the maker (use maker URL)
}): void {
  const byLabel = args.byParty === "creator" ? "The creator" : "The maker";
  safe(sendEmail({
    to: args.recipientEmail,
    subject: `Issue reported on "${args.fileName}"`,
    text:
      `${byLabel} reported an issue on "${args.fileName}":\n${args.body}\n\n` +
      `Open chat: ${args.isMaker ? makerJobUrl(args.jobId) : jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.recipientName)},</p>
       <p>${byLabel} flagged an issue on <strong>${escapeHtml(args.fileName)}</strong>.</p>
       ${quoteBlock(args.body)}
       ${ctaButton("Open chat", args.isMaker ? makerJobUrl(args.jobId) : jobUrl(args.jobId))}`,
  }));
}

// Chat-message debounce so a back-and-forth conversation doesn't fire one
// email per turn. Per-process Map; fine for single-instance dev. For scale,
// move to Redis or skip chat-message emails entirely.
const _chatLastSent = new Map<string, number>();
const CHAT_DEBOUNCE_MS = 5 * 60 * 1000;

export function notifyChatMessage(args: {
  recipientEmail: string | null;
  recipientUserId: string;
  recipientName: string;
  isMaker: boolean;
  jobId: string;
  fileName: string;
  fromName: string;
  body: string;
}): void {
  const key = `${args.jobId}:${args.recipientUserId}`;
  const now = Date.now();
  const last = _chatLastSent.get(key) ?? 0;
  if (now - last < CHAT_DEBOUNCE_MS) return;
  _chatLastSent.set(key, now);

  safe(sendEmail({
    to: args.recipientEmail,
    subject: `${args.fromName} messaged you about "${args.fileName}"`,
    text:
      `${args.fromName}: ${args.body}\n\n` +
      `Reply: ${args.isMaker ? makerJobUrl(args.jobId) : jobUrl(args.jobId)}`,
    html:
      `<p>Hey ${escapeHtml(args.recipientName)},</p>
       <p><strong>${escapeHtml(args.fromName)}</strong> sent you a message about <strong>${escapeHtml(args.fileName)}</strong>:</p>
       ${quoteBlock(args.body)}
       <p style="font-size:12px;color:rgba(0,0,0,0.45)">We only email the first message in a conversation burst. Open the thread for the full chat.</p>
       ${ctaButton("Open chat", args.isMaker ? makerJobUrl(args.jobId) : jobUrl(args.jobId))}`,
  }));
}
