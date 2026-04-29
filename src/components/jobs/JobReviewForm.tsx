"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function JobReviewForm({
  jobId,
  subjectName,
}: {
  jobId: string;
  subjectName: string;
}) {
  const router = useRouter();
  const [rating, setRating] = React.useState<number>(0);
  const [hover, setHover] = React.useState<number>(0);
  const [comment, setComment] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError("Pick a star rating before submitting.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, comment: comment || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `submit failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  };

  const display = hover || rating;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-2">
          Your rating for {subjectName}
        </div>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="p-1 -m-1 transition-transform hover:scale-110"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star
                className={
                  n <= display
                    ? "w-7 h-7 fill-amber-400 text-amber-500"
                    : "w-7 h-7 text-black/20"
                }
                strokeWidth={1.5}
              />
            </button>
          ))}
          {rating > 0 ? (
            <span className="font-mono text-sm tabular-nums text-black/55 ml-2">
              {rating} / 5
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1.5">
          Comment (optional)
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What was good or bad about this transaction?"
          maxLength={500}
          className="w-full bg-transparent border border-black/15 rounded-lg p-3 text-sm font-light outline-none focus:border-black/50 transition-colors min-h-[80px]"
        />
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-1 text-right tabular-nums">
          {comment.length} / 500
        </div>
      </div>

      {error ? (
        <div className="text-sm text-red-600 font-light">{error}</div>
      ) : null}

      <Button
        type="submit"
        size="md"
        disabled={pending || rating < 1}
        className="w-full"
      >
        {pending ? "Submitting…" : "Submit review"}
      </Button>

      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/45 leading-relaxed">
        Hidden from {subjectName} until they review you, or 14 days pass.
      </p>
    </form>
  );
}
