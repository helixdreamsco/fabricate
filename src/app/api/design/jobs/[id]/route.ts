import { NextResponse } from "next/server";
import { getDesignIdentity } from "@/lib/design/identity";
import { getJob, publicJobView, refreshAiJob } from "@/lib/design/jobs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const identity = await getDesignIdentity();
  let job = await getJob(id, identity);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  job = await refreshAiJob(job);
  return NextResponse.json(publicJobView(job));
}
