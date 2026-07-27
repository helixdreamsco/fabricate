"use client";
import * as React from "react";
import { Camera, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardSection } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { DesignViewer } from "./DesignViewer";
import { DesignJobStatus } from "./DesignJobStatus";
import { useDesignJob } from "@/hooks/useDesignJob";

const EXAMPLE_PROMPTS = [
  "a chunky smiling octopus planter",
  "low-poly fox figurine",
  "a gnome fishing on a mushroom",
  "chunky rocket ship desk ornament",
];

/**
 * AI text/image-to-creation. Requires sign-in (per-user quota); renders a
 * "coming soon" card when the generator or moderation keys are absent.
 */
export function AiPanel({
  available,
  signedIn,
  initialRemaining,
}: {
  available: boolean;
  signedIn: boolean;
  initialRemaining: number | null;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [image, setImage] = React.useState<{ dataUri: string; name: string } | null>(null);
  const [seed, setSeed] = React.useState(0);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(initialRemaining);
  const [submitting, setSubmitting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { job, error } = useDesignJob(jobId);

  if (!available) {
    return (
      <Card>
        <CardSection className="py-10 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-black/30" />
          <p className="mt-3 text-sm font-light text-black">
            AI creation is coming soon
          </p>
          <MonoLabel size="sm" className="mt-2 block">
            Type an idea or upload a photo — get a printable model
          </MonoLabel>
        </CardSection>
      </Card>
    );
  }

  const canSubmit =
    !submitting && signedIn && (image !== null || prompt.trim().length >= 3);

  const submit = async (submitSeed = seed) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const body = image
        ? { imageDataUri: image.dataUri, seed: submitSeed }
        : { prompt, seed: submitSeed };
      const res = await fetch("/api/design/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(
          data.message ??
            (data.error === "sign_in_required"
              ? "Sign in to use AI creation."
              : "Something went wrong — try again."),
        );
        return;
      }
      setJobId(data.jobId);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const regenerate = () => {
    const next = seed + 1; // new seed → fresh generation (skips dedupe)
    setSeed(next);
    setJobId(null);
    void submit(next);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type)) {
      setMessage("Please upload a JPG or PNG image.");
      return;
    }
    if (file.size > 5_000_000) {
      setMessage("Image too large — max 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setImage({ dataUri: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  };

  const busy =
    job && ["moderating", "generating", "downloading", "processing"].includes(job.state);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            type="text"
            value={image ? "" : prompt}
            disabled={Boolean(image) || !signedIn}
            maxLength={400}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            placeholder={
              !signedIn
                ? "Sign in to describe your creation…"
                : image
                  ? `Using photo: ${image.name}`
                  : "Describe your creation…"
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            startIcon={image ? <X className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
            onClick={() => (image ? setImage(null) : fileRef.current?.click())}
            disabled={!signedIn}
          >
            {image ? "Remove" : "Photo"}
          </Button>
          <Button withArrow onClick={() => submit()} disabled={!canSubmit}>
            {submitting ? "Checking…" : "Generate"}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      {!jobId && !image ? (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={!signedIn}
              onClick={() => setPrompt(example)}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-black/50 transition-colors hover:border-black/30 hover:text-black disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}

      {remaining !== null && signedIn ? (
        <MonoLabel size="xs">
          {remaining} free generation{remaining === 1 ? "" : "s"} left today
        </MonoLabel>
      ) : null}
      {!signedIn ? (
        <MonoLabel size="xs">Sign in to generate — 3 free per day</MonoLabel>
      ) : null}

      {message ? (
        <Card>
          <CardSection>
            <p className="text-sm font-light text-black">{message}</p>
          </CardSection>
        </Card>
      ) : null}

      {jobId && (busy || job?.state === "blocked" || job?.state === "failed") ? (
        <>
          <DesignJobStatus job={job} error={error} fileName="ai-design.stl" />
          {job?.state === "failed" ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={regenerate}>
                ↻ Try again
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setJobId(null);
                  setPrompt("");
                  setImage(null);
                }}
              >
                Discard
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {jobId && job?.state === "ready" ? (
        <>
          {job.provider === "local-demo" ? (
            <MonoLabel size="xs" muted={false} className="text-[#b45309]">
              Demo generator — placeholder shape, full print pipeline. Connect
              Meshy for real AI models.
            </MonoLabel>
          ) : null}
          <div className="h-[380px] overflow-hidden rounded-xl border border-black/[0.08]">
            <DesignViewer glbUrl={job.glbUrl} overlayNote="Print-checked model" />
          </div>
          <DesignJobStatus job={job} error={error} fileName="ai-design.stl" />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={regenerate}>
              ↻ Regenerate · uses 1 credit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setJobId(null);
                setPrompt("");
                setImage(null);
              }}
            >
              Discard
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
