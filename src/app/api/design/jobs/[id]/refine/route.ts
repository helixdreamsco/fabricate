import { NextResponse } from "next/server";
import { getDesignIdentity } from "@/lib/design/identity";
import { getJob, startRefine } from "@/lib/design/jobs";

/**
 * Optional paid texture stage (MESHY_ENABLE_REFINE=1). Off by default:
 * Meshy's refine stage adds texture only — irrelevant for one-colour FDM.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const identity = await getDesignIdentity();
  const job = await getJob(id, identity);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await startRefine(job);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 202 });
}
