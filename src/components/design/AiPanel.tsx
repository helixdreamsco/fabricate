"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardSection } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusDot } from "@/components/ui/StatusDot";
import { DesignViewer } from "./DesignViewer";
import { DesignJobStatus } from "./DesignJobStatus";
import { useDesignJob } from "@/hooks/useDesignJob";
import { routeComposerSubmit } from "@/lib/design/compose-route";

// Brand-flavoured prompts sit alongside the personal ones so the AI tab
// reads as useful for a business, not just a hobbyist. The templates handle
// these properly — these chips are for people who land here first.
const EXAMPLE_PROMPTS = [
  "our logo as a keyring",
  "QR stand for our counter",
  "branded coaster set",
  "a chunky smiling octopus planter",
  "low-poly fox figurine",
  "a gnome fishing on a mushroom",
];

type ClarifyQuestion = { question: string; options: string[] };

/**
 * Refine flow state. Text prompts walk clarify → concept → approve before a
 * 3D generation is spent; photo uploads and the demo provider go straight to
 * the generator as before.
 */
type Refine =
  | { phase: "questions"; questions: ClarifyQuestion[]; answers: (string | null)[] }
  | {
      phase: "concept";
      enriched: string;
      taskId: string;
      /** Which endpoint made it — text-to-image or image-to-image. */
      kind: "text" | "reference";
      progress: number;
    }
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
  initialPrompt = "",
}: {
  available: boolean;
  /** Meshy live → prompts get a concept-image preview step. */
  conceptImages: boolean;
  signedIn: boolean;
  initialRemaining: number | null;
  /** Idea typed into the landing composer, carried through sign-up. */
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = React.useState(initialPrompt);
  const [image, setImage] = React.useState<{ dataUri: string; name: string } | null>(null);
  const [seed, setSeed] = React.useState(0);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [refine, setRefine] = React.useState<Refine | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(initialRemaining);
  const [submitting, setSubmitting] = React.useState(false);
  const [composerFocus, setComposerFocus] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { job, error } = useDesignJob(jobId);

  /** Signed-out visitors get to compose; the account is asked for at the
      point they actually try to generate, with the prompt carried over. */
  const goSignIn = () => {
    const next = prompt.trim()
      ? `/design?prompt=${encodeURIComponent(prompt.trim())}`
      : "/design";
    router.push(`/account?callbackUrl=${encodeURIComponent(next)}`);
  };

  // Poll the concept image task while one is running.
  const conceptTaskId = refine?.phase === "concept" ? refine.taskId : null;
  const conceptKind = refine?.phase === "concept" ? refine.kind : "text";
  React.useEffect(() => {
    if (!conceptTaskId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/design/ai/concept/${conceptTaskId}?kind=${conceptKind}`,
        );
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
  }, [conceptTaskId, conceptKind]);

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

  const hasInput = image !== null || prompt.trim().length >= 3;
  const canSubmit = !submitting && signedIn && hasInput;

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

  /**
   * Kick off a concept image for the (possibly clarified) prompt, using the
   * attached photo as a reference when there is one — that's the only way
   * words and a picture both reach the result, since image-to-3D's own
   * prompt field only guides texture and we don't texture.
   */
  const startConcept = async (enriched: string, reference = image?.dataUri) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/design/ai/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enriched,
          ...(reference ? { imageDataUri: reference } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefine(null);
        setMessage(data.message ?? "Couldn't create a concept image — try again.");
        return;
      }
      setRefine({
        phase: "concept",
        enriched,
        taskId: data.taskId,
        kind: data.kind === "reference" ? "reference" : "text",
        progress: 0,
      });
    } catch {
      setRefine(null);
      setMessage("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (submitSeed = seed) => {
    const route = routeComposerSubmit({
      hasPhoto: image !== null,
      prompt,
      conceptImagesAvailable: conceptImages,
    });

    // A photo with words skips the clarifying questions on purpose — the
    // picture has already answered most of what they'd ask.
    if (route === "concept-from-photo") {
      return startConcept(prompt.trim(), image!.dataUri);
    }
    if (route === "image-to-3d") {
      return createJob({
        imageDataUri: image!.dataUri,
        // Carried for the audit trail even where it can't steer the mesh;
        // the composer says as much when that's the case.
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        seed: submitSeed,
      });
    }
    if (route === "text-to-3d") {
      return createJob({ prompt, seed: submitSeed });
    }
    if (route === "nothing") return;
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
    // Refine jobs regenerate from a fresh concept image of the same idea —
    // including the reference photo, when the idea had one.
    if (conceptImages && prompt.trim()) {
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
    <div className="flex flex-col gap-5">
      {/* Hero composer. The prompt is the headline act on this page, so it
          gets the size and elevation to match — a full-width card with the
          controls tucked inside it rather than an input in a toolbar row. */}
      <div
        className={cn(
          "rounded-[20px] border bg-white p-2 transition-[border-color,box-shadow] duration-200",
          composerFocus
            ? "border-black/25 shadow-xl"
            : "border-black/10 shadow-lg",
        )}
      >
        {/* The photo sits above the text as its own removable chip. It used
            to take the textarea over — blanking it, disabling it, and
            replacing the placeholder — so attaching a picture meant giving
            up the ability to say anything about it. */}
        {image ? (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3 md:px-5">
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white py-1 pl-1 pr-3">
              {/* Local object URL from the user's own file — no optimiser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.dataUri}
                alt={image.name}
                className="h-7 w-7 rounded-full object-cover"
              />
              <span className="truncate text-[13px] font-light text-black">
                {image.name}
              </span>
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove photo"
                className="ml-0.5 text-black/35 transition-colors hover:text-black"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
            <MonoLabel size="xs">
              {conceptImages
                ? "Describe what to change about it — or leave it blank"
                : "Photo only — descriptions need the full generator"}
            </MonoLabel>
          </div>
        ) : null}
        <textarea
          value={prompt}
          maxLength={400}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setComposerFocus(true)}
          onBlur={() => setComposerFocus(false)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter is a newline, as in any composer.
            if (e.key !== "Enter" || e.shiftKey) return;
            if (!signedIn) {
              e.preventDefault();
              goSignIn();
            } else if (canSubmit) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={
            image
              ? "Make it a keyring, flatten the base…"
              : "A chunky smiling octopus planter…"
          }
          className={cn(
            "block w-full resize-none border-0 bg-transparent px-4 pb-2 text-lg font-light leading-[1.4] tracking-[-0.015em] text-black outline-none placeholder:text-black/30 md:px-5 md:text-2xl",
            image ? "pt-2 md:pt-2" : "pt-4 md:pt-5",
          )}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-2 md:pl-5">
          <span className="inline-flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => {
                if (!signedIn) return goSignIn();
                // Always the picker — removing is the chip's ✕ now, so this
                // stays a single-purpose control.
                fileRef.current?.click();
              }}
              className="inline-flex items-center gap-[7px] border-0 bg-transparent p-0 text-black/50 transition-colors hover:text-black disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
              <MonoLabel size="sm" muted={false} className="text-inherit">
                {image ? "Replace photo" : "Add a photo"}
              </MonoLabel>
            </button>
            <MonoLabel size="xs">{prompt.length}/400</MonoLabel>
          </span>
          <Button
            size="lg"
            withArrow
            onClick={() => (signedIn ? void submit() : goSignIn())}
            // Signed out, Generate stays live and routes to sign-in — a
            // dead button gives no clue what's missing.
            disabled={signedIn && !canSubmit}
          >
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
        <div className="flex flex-wrap items-center gap-2">
          <MonoLabel size="xs" className="mr-1">
            Try
          </MonoLabel>
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-black/10 bg-white px-3.5 py-[7px] font-mono text-[9px] uppercase tracking-[0.14em] text-black/55 transition-all hover:border-black/35 hover:text-black"
            >
              {example}
            </button>
          ))}
          {remaining !== null && signedIn ? (
            <MonoLabel size="xs" className="ml-auto">
              {remaining} free generation{remaining === 1 ? "" : "s"} left today
            </MonoLabel>
          ) : null}
        </div>
      ) : null}

      {remaining !== null && signedIn && (jobId || image || refine) ? (
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
