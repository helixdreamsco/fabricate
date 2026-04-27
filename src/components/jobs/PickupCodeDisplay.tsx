import QRCode from "qrcode";

/**
 * Server-rendered pickup code panel — QR (as inline SVG) + 6-digit human
 * code. Designed to be shown on the creator's phone for the maker to scan or
 * read out at handover.
 *
 * Shown on the creator's job page when a pickup token is live. Reinforces
 * that the creator is going TO the maker by surfacing the maker's name +
 * address front and centre.
 */
export async function PickupCodeDisplay({
  code,
  qrPayload,
  expiresAt,
  makerName,
  makerPostcode,
  pickupNote,
}: {
  code: string;
  qrPayload: string;
  expiresAt: string;
  makerName?: string | null;
  makerPostcode?: string | null;
  pickupNote?: string | null;
}) {
  const svg = await QRCode.toString(qrPayload, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  const expiresIn = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const minutes = Math.floor(expiresIn / 60000);

  return (
    <div className="bg-white rounded-2xl border border-black/[0.08] p-5 sm:p-6 flex flex-col items-center text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
        Pickup ready · go to the maker
      </div>
      {makerName ? (
        <div className="mb-4 w-full">
          <div className="text-lg font-bold leading-tight">{makerName}</div>
          {makerPostcode ? (
            <div className="font-mono text-sm tracking-wide text-black/70 mt-0.5">
              {makerPostcode}
            </div>
          ) : null}
          {pickupNote ? (
            <div className="text-xs font-light text-black/55 italic mt-2 leading-relaxed">
              You suggested: &ldquo;{pickupNote}&rdquo;<br />
              <span className="text-black/40">Confirm the actual spot in chat.</span>
            </div>
          ) : (
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-2">
              Use chat to agree time / alternate location
            </div>
          )}
        </div>
      ) : null}
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
        Show this at handover
      </div>
      <div
        className="w-44 h-44 sm:w-56 sm:h-56 mb-4"
        // qrcode lib output is trusted — generated server-side from a fixed
        // payload pattern. Safe to inline.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-1">
        Or 6-digit code
      </div>
      <div className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.2em] tabular-nums">
        {code.slice(0, 3)} {code.slice(3)}
      </div>
      <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
        Expires in ~{minutes} min · single-use
      </div>
    </div>
  );
}
