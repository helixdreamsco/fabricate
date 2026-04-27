import { redirect } from "next/navigation";

/**
 * Legacy demo order tracking page. The production flow lives at /jobs/[id]
 * with a different (cuid) id format, so we can't deep-link old "FB-..." ids
 * — bounce to the creator's job list instead.
 */
export default async function LegacyOrderPage() {
  redirect("/jobs");
}
