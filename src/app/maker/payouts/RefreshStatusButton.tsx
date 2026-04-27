"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Triggers a server-component re-render which re-queries Stripe for the
 * connected account's status. Useful while the maker is staring at a
 * "Pending review" state and Stripe is finishing up.
 */
export function RefreshStatusButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    setBusy(true);
    router.refresh();
    // Small delay so the spinner is visible even on a fast refresh.
    setTimeout(() => setBusy(false), 600);
  }

  return (
    <Button
      size="md"
      variant="secondary"
      onClick={refresh}
      disabled={busy}
      startIcon={<RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} strokeWidth={2.4} />}
    >
      {busy ? "Checking…" : "Refresh status"}
    </Button>
  );
}
