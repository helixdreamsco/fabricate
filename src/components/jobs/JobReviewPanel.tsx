import { Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { fetchJobReviews, type SerializedReview } from "@/lib/reviews";
import { JobReviewForm } from "./JobReviewForm";

/**
 * Server component. Renders one of three states:
 *
 *   1. Submission form  — viewer hasn't reviewed yet (window open).
 *   2. Awaiting reveal  — viewer submitted, other party hasn't, cutoff not
 *                         yet hit. Shows their own review back to them.
 *   3. Both visible     — both reviews revealed (mutual submit OR cutoff).
 */
export async function JobReviewPanel({
  jobId,
  viewerId,
  otherPartyName,
}: {
  jobId: string;
  viewerId: string;
  otherPartyName: string;
}) {
  const view = await fetchJobReviews({ jobId, viewerId });

  return (
    <Card className="p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
        Reviews
      </div>

      {view.mine === null ? (
        <JobReviewForm jobId={jobId} subjectName={otherPartyName} />
      ) : (
        <div className="space-y-4">
          <ReviewBlock
            heading="Your review"
            review={view.mine}
            authorLabel="You"
          />

          {view.theirs ? (
            <ReviewBlock
              heading={`From ${otherPartyName}`}
              review={view.theirs}
              authorLabel={view.theirs.authorName ?? otherPartyName}
            />
          ) : view.theirsExists ? (
            <PendingNote text={`${otherPartyName} has reviewed you. Reveal pending — both reviews appear together.`} />
          ) : view.cutoffPassed ? (
            <PendingNote text={`${otherPartyName} did not leave a review within the 14-day window.`} />
          ) : (
            <PendingNote text={`Waiting for ${otherPartyName} to review you. Their review reveals when they submit, or after 14 days from completion.`} />
          )}
        </div>
      )}
    </Card>
  );
}

function ReviewBlock({
  heading,
  review,
  authorLabel,
}: {
  heading: string;
  review: SerializedReview;
  authorLabel: string;
}) {
  return (
    <div className="rounded-lg border border-black/[0.08] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 mb-1.5">
        {heading}
      </div>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={
              n <= review.rating
                ? "w-4 h-4 fill-amber-400 text-amber-500"
                : "w-4 h-4 text-black/20"
            }
            strokeWidth={1.5}
          />
        ))}
        <span className="font-mono text-xs tabular-nums text-black/55 ml-1.5">
          {review.rating} / 5
        </span>
      </div>
      {review.comment ? (
        <p className="text-sm font-light text-black/75 whitespace-pre-wrap leading-relaxed">
          {review.comment}
        </p>
      ) : null}
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40 mt-2">
        {authorLabel} ·{" "}
        {new Date(review.createdAt).toLocaleDateString("en-GB", {
          dateStyle: "medium",
        })}
      </div>
    </div>
  );
}

function PendingNote({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 px-4 py-3 text-sm font-light text-black/60 leading-relaxed">
      {text}
    </div>
  );
}
