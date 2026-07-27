import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/design/registry";
import { getDesignIdentity } from "@/lib/design/identity";
import { getJob } from "@/lib/design/jobs";
import { validateParams } from "@/lib/design/params";
import { Customiser } from "@/components/design/Customiser";
import type { ParamValues } from "@/lib/design/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>;
}): Promise<Metadata> {
  const { templateId } = await params;
  const spec = getTemplate(templateId);
  return { title: spec ? `${spec.name} — Design — Fabricate` : "Design — Fabricate" };
}

export default async function CustomiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ remix?: string }>;
}) {
  const { templateId } = await params;
  const { remix } = await searchParams;
  const spec = getTemplate(templateId);
  if (!spec) notFound();

  // "Remix": reopen a completed design with its exact parameters.
  let initialParams: ParamValues | undefined;
  if (remix) {
    const identity = await getDesignIdentity();
    const job = await getJob(remix, identity);
    if (job?.paramsJson && job.templateId === templateId) {
      try {
        const raw = JSON.parse(job.paramsJson) as { p?: ParamValues };
        const validated = validateParams(spec, raw.p ?? raw);
        if (validated.ok) initialParams = validated.values;
      } catch {
        // fall through to defaults
      }
    }
  }

  return <Customiser spec={spec} initialParams={initialParams} />;
}
