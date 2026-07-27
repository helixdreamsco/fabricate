"use client";
import * as React from "react";
import { Camera, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardSection } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusDot } from "@/components/ui/StatusDot";
import { DesignViewer } from "./DesignViewer";
import { DesignJobStatus } from "./DesignJobStatus";
import { useDesignJob } from "@/hooks/useDesignJob";

const EXAMPLE_PROMPTS = [
  "a chunky smiling octopus planter",
  "low-poly fox figurine",
  "a gnome fishing on a mushroom",
  "chunky rocket ship desk ornament",
];

type ClarifyQuestion = { question: string; options: string[] };

/**
 * Refine flow state. Text prompts walk clarify → concept → approve before a
 * 3D generation is spent; photo uploads and the demo provider go straight to
 * the generator as before.
 */
type Refine =
  | { phase: "questions"; questions: ClarifyQuestion[]; answers: (string | null)[] }
  | { phase: "concept"; enriched: string; taskId: string; progress: number }
  | { phase: "approve"; enriched: string; imageUrl: string };

/**
 * AI text/image-to-creation. Requires sign-in (per-user quota); renders a
 * "coming soon" card when the generator or moderation keys are absent.
 */
export function AiPanel({
  available,
  conceptImages,
  signedIn,
  initialRemaining,
}: {
  available: boolean;
  /** Meshy live → prompts get a concept-image preview step. */
  conceptImages: boolean;
  signedIn: boolean;
  initialRemaining: number | null;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [image, setImage] = React.useState<{ dataUri: string; name: string } | null>(null);
  const [seed, setSeed] = React.useState(0);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [refine, setRefine] = React.useState<Refine | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(initialRemaining);
  const [submitting, setSubmitting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { job, error } = useDesignJob(jobId);

  // Poll the concept image task while one is running.
  const conceptTaskId = refine?.phase === "concept" ? refine.taskId : null;
  React.useEffect(() => {
    if (!conceptTaskId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/design/ai/concept/${conceptTaskId}`);
        if (!res.ok) throw new Error(`poll ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "succeeded" && data.imageUrls?.[0]) {
          setRefine((r) =>
            r?.phase === "concept" && r.taskId === conceptTaskId
              ? { phase: "approve", enriched: r.enriched, imageUrl: data.imageUrls[0] }
              : r,
          );
        } else if (data.status === "failed" || data.status === "canceled") {
          setRefine(null);
          setMessage(data.error ?? "Concept image failed — try again.");
        } else {
          setRefine((r) =>
            r?.phase === "concept" && r.taskId === conceptTaskId
              ? { ...r, progress: data.progress ?? r.progress }
              : r,
          );
        }
      } catch {
        // transient poll error — keep trying until the effect is torn down
      }
    };
    const timer = setInterval(tick, 3000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conceptTaskId]);

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

  /** Create the 3D generation job (direct, photo, or approved-concept). */
  const createJob = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    setMessage(null);
    try {
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
      setRefine(null);
      setJobId(data.jobId);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /** Kick off a concept image for the (possibly clarified) prompt. */
  const startConcept = async (enriched: string) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/design/ai/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: enriched }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefine(null);
        setMessage(data.message ?? "Couldn't create a concept image — try again.");
        return;
      }
      setRefine({ phase: "concept", enriched, taskId: data.taskId, progress: 0 });
    } catch {
      setRefine(null);
      setMessage("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (submitSeed = seed) => {
    // Photo uploads and the demo generator keep the direct path.
    if (image) {
      return createJob({ imageDataUri: image.dataUri, seed: submitSeed });
    }
    if (!conceptImages) {
      return createJob({ prompt, seed: submitSeed });
    }
    // Refine flow: ask for clarifications first (empty = specific enough).
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/design/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Refine being down should never stop generation — fall back.
        if (res.status === 503) return createJob({ prompt, seed: submitSeed });
        setMessage(data.message ?? "Something went wrong — try again.");
        return;
      }
      setSubmitting(false);
      if (data.questions?.length) {
        setRefine({
          phase: "questions",
          questions: data.questions,
          answers: data.questions.map(() => null),
        });
      } else {
        await startConcept(prompt.trim());
      }
    } catch {
      setMessage("Network error — try again.");
      setSubmitting(false);
    }
  };

  const regenerate = () => {
    const next = seed + 1; // new seed → fresh generation (skips dedupe)
    setSeed(next);
    setJobId(null);
    // Refine jobs regenerate from a fresh concept image of the same idea.
    if (conceptImages && !image && prompt.trim()) {
      void startConcept(prompt.trim());
    } else {
      void submit(next);
    }
  };

  const resetAll = () => {
    setJobId(null);
    setRefine(null);
    setPrompt("");
    setImage(null);
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

  const enrichedFromAnswers = () => {
    if (refine?.phase !== "questions") return prompt.trim();
    const chosen = refine.answers.filter((a): a is string => Boolean(a));
    return chosen.length ? `${prompt.trim()}, ${chosen.join(", ")}` : prompt.trim();
  };

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

      {!jobId && !image && !refine ? (
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
        <MonoLabel size="xs">Sign in to generate — free generations every day</MonoLabel>
      ) : null}

      {message ? (
        <Card>
          <CardSection>
            <p className="text-sm font-light text-black">{message}</p>
          </CardSection>
        </Card>
      ) : null}

      {refine?.phase === "questions" ? (
        <Card>
          <CardSection>
            <MonoLabel size="sm" muted={false} className="block">
              Quick questions so it comes out right
            </MonoLabel>
            <div className="mt-4 flex flex-col gap-4">
              {refine.questions.map((q, qi) => (
                <div key={q.question}>
                  <p className="text-sm font-light text-black">{q.question}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.options.map((option) => {
                      const selected = refine.answers[qi] === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setRefine({
                              ...refine,
                              answers: refine.answers.map((a, ai) =>
                                ai === qi ? (selected ? null : option) : a,
                              ),
                            })
                          }
                          className={`rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                            selected
                              ? "border-black bg-black text-white"
                              : "border-black/10 bg-white text-black/50 hover:border-black/30 hover:text-black"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <Button
                withArrow
                disabled={submitting}
                onClick={() => void startConcept(enrichedFromAnswers())}
              >
                {submitting ? "Working…" : "Create preview image"}
              </Button>
              <Button variant="ghost" onClick={() => setRefine(null)}>
                Cancel
              </Button>
            </div>
            <MonoLabel size="xs" className="mt-3 block">
              Answer what you like — skipped questions use the model&apos;s judgement
            </MonoLabel>
          </CardSection>
        </Card>
      ) : null}

      {refine?.phase === "concept" ? (
        <Card>
          <CardSection>
            <div className="flex items-center gap-3">
              <StatusDot tone="printing" pulse />
              <MonoLabel size="sm" muted={false}>
                Sketching your idea…
              </MonoLabel>
            </div>
            <ProgressBar value={Math.max(8, refine.progress)} className="mt-3" />
            <MonoLabel size="xs" className="mt-3 block">
              A preview image first — approve it before the 3D model is built
            </MonoLabel>
          </CardSection>
        </Card>
      ) : null}

      {refine?.phase === "approve" ? (
        <Card>
          <CardSection>
            <MonoLabel size="sm" muted={false} className="block">
              Does this match what you pictured?
            </MonoLabel>
            {/* Meshy asset URLs are short-lived signed URLs — plain img, no optimiser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={refine.imageUrl}
              alt={`Concept: ${refine.enriched}`}
              className="mt-3 w-full max-w-md rounded-xl border border-black/[0.08]"
            />
            <MonoLabel size="xs" className="mt-2 block">
              {refine.enriched}
            </MonoLabel>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                withArrow
                disabled={submitting}
                onClick={() =>
                  void createJob({
                    prompt: refine.enriched,
                    conceptImageUrl: refine.imageUrl,
                    seed,
                  })
                }
              >
                {submitting ? "Starting…" : "Make it 3D"}
              </Button>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => void startConcept(refine.enriched)}
              >
                ↻ Different image
              </Button>
              <Button variant="ghost" onClick={() => setRefine(null)}>
                Start over
              </Button>
            </div>
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
              <Button variant="ghost" onClick={resetAll}>
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
            <Button variant="ghost" onClick={resetAll}>
              Discard
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
