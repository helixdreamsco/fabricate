"use client";
import * as React from "react";
import { Camera, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Pickup code entry — supports two input modes:
 *   1. Manual: 6 digit input. Universal fallback.
 *   2. Camera: BarcodeDetector-based QR scan (Chromium browsers + recent
 *      Safari). Falls back invisibly if unsupported.
 *
 * On verify, calls /api/jobs/:id/pickup/verify and lets the parent route
 * refresh — we just call onSuccess after a 200.
 */
export function PickupCodeEntry({
  jobId,
  onSuccess,
}: {
  jobId: string;
  onSuccess?: () => void;
}) {
  const [mode, setMode] = React.useState<"manual" | "camera">("manual");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/jobs/${jobId}/pickup/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? `failed (${r.status})`);
        return;
      }
      setSuccess(true);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="border border-emerald-500/30 bg-emerald-500/[0.06] rounded-2xl p-5 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700 mb-1">
          Pickup verified
        </div>
        <div className="text-sm font-light text-black/70">
          Funds released and job marked complete.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-black/[0.08] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Button
          size="sm"
          variant={mode === "manual" ? "primary" : "secondary"}
          onClick={() => setMode("manual")}
          startIcon={<KeyRound className="w-3 h-3" strokeWidth={2.2} />}
        >
          Type code
        </Button>
        <Button
          size="sm"
          variant={mode === "camera" ? "primary" : "secondary"}
          onClick={() => setMode("camera")}
          startIcon={<Camera className="w-3 h-3" strokeWidth={2.2} />}
        >
          Scan QR
        </Button>
      </div>

      {mode === "manual" ? (
        <ManualEntry busy={busy} code={code} setCode={setCode} onSubmit={submit} />
      ) : (
        <CameraScan busy={busy} onCode={submit} />
      )}

      {error ? (
        <div className="mt-3 text-sm text-red-600 font-light">{error}</div>
      ) : null}
    </div>
  );
}

function ManualEntry({
  busy, code, setCode, onSubmit,
}: {
  busy: boolean;
  code: string;
  setCode: (s: string) => void;
  onSubmit: (s: string) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) onSubmit(code);
      }}
    >
      <input
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="• • • • • •"
        className={cn(
          "w-full text-center font-mono text-3xl sm:text-4xl tracking-[0.4em] tabular-nums",
          "bg-black/[0.03] rounded-xl py-4 outline-none border border-black/[0.08]",
          "focus:border-black/40 transition-colors",
        )}
        maxLength={6}
        autoFocus
      />
      <Button
        type="submit"
        size="lg"
        className="w-full mt-3"
        disabled={code.length !== 6 || busy}
        withArrow
      >
        {busy ? "Verifying…" : "Verify pickup"}
      </Button>
    </form>
  );
}

function CameraScan({
  busy,
  onCode,
}: {
  busy: boolean;
  onCode: (s: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [streamErr, setStreamErr] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const lastCodeRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let raf = 0;

    type AnyDetector = {
      detect: (s: HTMLVideoElement | ImageBitmap) => Promise<Array<{ rawValue: string }>>;
    };
    type DetectorClass = new (opts: { formats: string[] }) => AnyDetector;

    async function start() {
      const Det = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      if (!Det) {
        setSupported(false);
        return;
      }
      setSupported(true);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new Det({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped) return;
          try {
            const results = await detector.detect(video);
            for (const r of results) {
              const m = /\b(\d{6})\b/.exec(r.rawValue ?? "");
              if (m && m[1] !== lastCodeRef.current) {
                lastCodeRef.current = m[1];
                onCode(m[1]);
                return;
              }
            }
          } catch {
            /* per-frame error — keep going */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setStreamErr(e instanceof Error ? e.message : "camera error");
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  if (supported === false) {
    return (
      <div className="border border-dashed border-black/15 rounded-xl px-4 py-6 text-center">
        <X className="w-4 h-4 text-black/40 mx-auto mb-2" strokeWidth={2.2} />
        <div className="text-sm font-light text-black/55 leading-relaxed">
          This browser doesn&rsquo;t support QR scanning.
          <br />
          Use <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Type code</span> instead.
        </div>
      </div>
    );
  }
  if (streamErr) {
    return (
      <div className="border border-dashed border-red-500/30 rounded-xl px-4 py-6 text-center text-sm font-light text-red-700">
        Couldn&rsquo;t open camera: {streamErr}
      </div>
    );
  }
  return (
    <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-h-[60vh]">
      <video
        ref={videoRef}
        playsInline
        muted
        className={cn("w-full h-full object-cover", busy && "opacity-50")}
      />
      <div className="absolute inset-6 border-2 border-white/70 rounded-2xl pointer-events-none" />
      <div className="absolute bottom-2 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
        Point at the customer&rsquo;s QR
      </div>
    </div>
  );
}
