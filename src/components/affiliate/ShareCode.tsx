"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

/** Displays the affiliate code + a copyable share link. Defers reading
 *  window.location.origin to render time so SSR doesn't mismatch. */
export function ShareCode({ code }: { code: string }) {
  const [origin, setOrigin] = React.useState("");
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = origin ? `${origin}/r/${code}` : `/r/${code}`;

  const copy = async (what: "code" | "link", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard API blocked (insecure context, etc.) — fall back to
      // a select + manual copy on the user's end. Nothing to do.
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => copy("code", code)}
        className="w-full rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 flex items-center justify-between hover:border-black/30 transition-colors"
      >
        <span className="font-mono text-sm">{code}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 flex items-center gap-1.5">
          {copied === "code" ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy code
            </>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => copy("link", shareUrl)}
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-3 flex items-center justify-between hover:border-black/30 transition-colors"
      >
        <span className="font-mono text-[12px] text-black/65 truncate">
          {shareUrl}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 flex items-center gap-1.5 shrink-0 ml-3">
          {copied === "link" ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy link
            </>
          )}
        </span>
      </button>
    </div>
  );
}
