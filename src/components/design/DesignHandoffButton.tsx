"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { savePendingUpload, savePendingHints } from "@/lib/order-storage";

/**
 * Send a finished design into the normal ordering flow.
 *
 * Fetches the print-checked STL and stashes it exactly like a homepage
 * upload, so `/configure` and everything after it stays a single code path
 * whether the file came from a dropzone or from the customiser. The run size
 * rides along so a 25-unit merch order doesn't quietly reset to 1.
 */
export function DesignHandoffButton({
  stlUrl,
  fileName,
  quantity = 1,
  label = "Print with a maker",
  size,
  disabled,
}: {
  stlUrl: string;
  fileName: string;
  quantity?: number;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(stlUrl);
      if (!res.ok) throw new Error(`fetch STL ${res.status}`);
      const file = new File([await res.blob()], fileName, { type: "model/stl" });
      await savePendingUpload(file);
      await savePendingHints({ quantity });
      router.push("/configure");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't hand off — try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <Button size={size} withArrow onClick={go} disabled={busy || disabled}>
        {busy ? "Preparing…" : label}
      </Button>
      {error ? (
        <MonoLabel size="xs" muted={false} className="mt-2 block text-[#ef4444]">
          {error}
        </MonoLabel>
      ) : null}
    </>
  );
}
