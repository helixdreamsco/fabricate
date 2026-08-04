"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardSection } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "a chunky smiling octopus planter",
  "low-poly fox figurine",
  "desk nameplate",
];

/** Where the composer sends someone once they have an account. */
function designHref(prompt: string) {
  const trimmed = prompt.trim();
  return trimmed ? `/design?prompt=${encodeURIComponent(trimmed)}` : "/design";
}

/**
 * Landing-page composer — the primary way in. Generation needs an account
 * (per-user quota) and this only ever renders for signed-out visitors, so
 * Generate goes straight to sign-in rather than pretending to start work.
 * Focusing the box surfaces the same thing as a card first, so the account
 * requirement isn't a surprise sprung after they've typed. Either way the
 * prompt rides along in the callbackUrl and survives the round-trip.
 */
export function AiComposer({
  inputRef,
  freeGenerations,
}: {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Daily free-generation allowance, so the sign-up card promises the real number. */
  freeGenerations: number;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [signUp, setSignUp] = React.useState(false);

  const goSignIn = () =>
    router.push(`/account?callbackUrl=${encodeURIComponent(designHref(prompt))}`);

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "rounded-[18px] border bg-white p-1.5 transition-[border-color,box-shadow] duration-200",
          focus ? "border-black/25 shadow-xl" : "border-black/10 shadow-lg",
        )}
      >
        <div className="flex items-center gap-2 px-3.5 pt-3">
          <Sparkles className="h-[13px] w-[13px] text-[#7c3aed]" />
          <MonoLabel size="sm" muted={false}>
            Describe it — we model it
          </MonoLabel>
        </div>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => {
            setFocus(true);
            setSignUp(true);
          }}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            // Enter submits, as in any composer — and submitting means
            // signing in until there's an account behind it.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goSignIn();
            }
          }}
          rows={2}
          maxLength={400}
          placeholder="A chunky smiling octopus planter…"
          className="block w-full resize-none border-0 bg-transparent px-3.5 pb-1.5 pt-2.5 text-lg font-light leading-[1.4] tracking-[-0.015em] text-black outline-none placeholder:text-black/30 md:text-xl"
        />
        <div className="flex items-center justify-between gap-3 pb-1.5 pl-3.5 pr-2 pt-1">
          <button
            type="button"
            onClick={goSignIn}
            className="inline-flex items-center gap-[7px] border-0 bg-transparent p-0 text-black/50 transition-colors hover:text-black"
          >
            <Camera className="h-3.5 w-3.5" />
            <MonoLabel size="sm" className="text-inherit">
              Add a photo
            </MonoLabel>
          </button>
          <Button withArrow onClick={goSignIn}>
            Generate
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3">
          <MonoLabel size="xs" className="mr-0.5">
            Try
          </MonoLabel>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-black/10 bg-white px-[11px] py-[5px] font-mono text-[9px] uppercase tracking-[0.14em] text-black/55 transition-colors hover:border-black/35 hover:text-black"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {signUp ? (
        <SignUpPrompt
          freeGenerations={freeGenerations}
          onSignIn={goSignIn}
          onDismiss={() => setSignUp(false)}
        />
      ) : null}
    </div>
  );
}

function SignUpPrompt({
  freeGenerations,
  onSignIn,
  onDismiss,
}: {
  freeGenerations: number;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="slide-in border-black/15">
      <CardSection>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="m-0 text-[15px] font-medium tracking-[-0.01em] text-black">
              Create a free account to generate
            </p>
            <MonoLabel size="sm" className="mt-1 block">
              {freeGenerations} free generation
              {freeGenerations === 1 ? "" : "s"} a day · no card needed
            </MonoLabel>
          </div>
          <span className="inline-flex items-center gap-2">
            <Button withArrow onClick={onSignIn}>
              Create account
            </Button>
            <Button variant="ghost" onClick={onDismiss}>
              Not now
            </Button>
          </span>
        </div>
      </CardSection>
    </Card>
  );
}
