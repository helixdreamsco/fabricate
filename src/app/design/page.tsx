import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { allTemplates } from "@/lib/design/registry";
import type { TemplateSpec } from "@/lib/design/schema";
import { getProvider, conceptImagesAvailable } from "@/lib/design/meshy";
import { classifierAvailable } from "@/lib/design/moderation";
import { generationsRemaining } from "@/lib/design/jobs";
import { getDesignIdentity, ownerWhere } from "@/lib/design/identity";
import { prisma } from "@/lib/prisma";
import { AiPanel } from "@/components/design/AiPanel";
import { MonoLabel } from "@/components/ui/MonoLabel";

export const metadata: Metadata = {
  title: "Design — Fabricate",
  description:
    "Describe anything you can picture and we'll model it, print-check it and quote it — or start from a template. A local maker prints it.",
};

// AI availability + quota depend on runtime env and session.
export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const templates = allTemplates();
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  // Only surface the library once there's something in it — an empty link
  // on a first visit is noise.
  const identity = await getDesignIdentity();
  const designCount = await prisma.designJob.count({
    where: { ...ownerWhere(identity), state: "ready", stlKey: { not: null } },
  });
  const aiAvailable = getProvider().available() && classifierAvailable();
  const remaining =
    aiAvailable && session?.user?.id
      ? await generationsRemaining(session.user.id)
      : null;

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-16 px-5 pb-24 pt-12 md:gap-16 md:px-8 md:pt-[72px]">
      {/* Composer first: describing what you want is the primary way in, and
          the templates below are the fallback for people who'd rather fill in
          a shape than describe one. */}
      <section className="flex flex-col gap-7">
        <div className="max-w-[720px]">
          <MonoLabel size="xs" className="mb-4 block">
            Describe it · we model it · a maker prints it
          </MonoLabel>
          <h1 className="m-0 text-[38px] font-bold leading-[1.02] tracking-[-0.03em] text-black md:text-[52px]">
            Say it out loud.
            <br />
            We&rsquo;ll make it real.
          </h1>
          <p className="mt-4 text-base font-light leading-[1.55] text-black/55 text-pretty md:text-lg">
            Type anything you can picture. We ask a couple of questions, show
            you a sketch, then build a print-checked 3D model and quote it.
          </p>
        </div>

        <AiPanel
          available={aiAvailable}
          conceptImages={conceptImagesAvailable() && classifierAvailable()}
          signedIn={signedIn}
          initialRemaining={remaining}
        />

        {designCount > 0 ? (
          <Link
            href="/design/mine"
            className="inline-flex items-center gap-2 self-start font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 underline underline-offset-4 transition-colors hover:text-black"
          >
            Your designs ({designCount})
          </Link>
        ) : null}
      </section>

      <section className="border-t border-black/[0.08] pt-7">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <MonoLabel size="sm" muted={false}>
            Or start from a template
          </MonoLabel>
          <MonoLabel size="xs">
            Fixed shapes you fill in with your own text — no generation used.
          </MonoLabel>
        </div>

        {/* One row, brand templates first. Splitting this into labelled
            "For brands" / "For you" grids pushed it onto two rows, which
            gave a secondary option more vertical weight than the composer
            above it. The audience is still legible from the names. */}
        <TemplateRow
          templates={[
            ...templates.filter((t) => t.audience === "brands"),
            ...templates.filter((t) => t.audience !== "brands"),
          ]}
        />
      </section>

      <MonoLabel size="xs" className="block max-w-[640px] leading-[1.7]">
        Every design is rebuilt, repaired and slice-checked server-side before
        it can be ordered — if it quotes, it prints.
      </MonoLabel>
    </main>
  );
}

/** The full template set as a single row. */
function TemplateRow({ templates }: { templates: TemplateSpec[] }) {
  if (!templates.length) return null;
  return (
    <div className="mt-6">
      {/* Column count tracks the template count so the row always fills —
          hardcoding the mock's six left gaps once four templates were
          removed. Applied only at lg via a CSS variable: an inline
          grid-template-columns would beat the responsive classes at every
          width and flatten the phone layout to one long row. */}
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--template-cols),minmax(0,1fr))]"
        style={
          {
            "--template-cols": Math.min(templates.length, 6),
          } as React.CSSProperties
        }
      >
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/design/${t.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white transition-colors hover:border-black/25"
          >
            {/* No mix-blend-multiply: that existed to knock the white out of
                the old flat SVGs. These are transparent renders of the real
                mesh, and multiplying would just muddy the purple. */}
            <div className="border-b border-black/[0.06] bg-[#f5f5f5] p-2.5">
              <Image
                src={t.thumbnail}
                alt={`${t.name} — 3D preview`}
                width={400}
                height={280}
                className="block w-full"
                unoptimized
              />
            </div>
            <div className="px-3 pb-3 pt-2.5">
              <p className="m-0 text-[13px] font-medium text-black">{t.name}</p>
              <p className="mt-[3px] line-clamp-2 text-xs font-light leading-[1.45] text-black/45">
                {t.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
