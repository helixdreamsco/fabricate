import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { allTemplates } from "@/lib/design/registry";
import { getProvider, conceptImagesAvailable } from "@/lib/design/meshy";
import { classifierAvailable } from "@/lib/design/moderation";
import { generationsRemaining } from "@/lib/design/jobs";
import { AiPanel } from "@/components/design/AiPanel";
import { MonoLabel } from "@/components/ui/MonoLabel";

export const metadata: Metadata = {
  title: "Design — Fabricate",
  description:
    "Create your own 3D model: customise a template with live preview, or describe an idea and let AI model it. Print-checked before you pay.",
};

// AI availability + quota depend on runtime env and session.
export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const templates = allTemplates();
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const aiAvailable = getProvider().available() && classifierAvailable();
  const remaining =
    aiAvailable && session?.user?.id
      ? await generationsRemaining(session.user.id)
      : null;

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-8 md:px-8">
      <div className="flex items-baseline gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-black md:text-4xl">
          Design something custom.
        </h1>
        <MonoLabel size="md" className="hidden sm:inline">
          Pick a template or describe an idea.
        </MonoLabel>
      </div>

      <div className="mt-8">
        <MonoLabel size="sm" className="mb-3 block">
          Templates
        </MonoLabel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/design/${t.id}`}
              className="group overflow-hidden rounded-xl border border-black/[0.08] bg-white transition-colors hover:border-black/25"
            >
              <Image
                src={t.thumbnail}
                alt={t.name}
                width={200}
                height={140}
                className="w-full border-b border-black/[0.06]"
                unoptimized
              />
              <div className="p-3">
                <p className="text-sm font-medium text-black">{t.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs font-light text-black/50">
                  {t.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10 max-w-3xl">
        <MonoLabel size="sm" className="mb-3 block">
          AI creation
        </MonoLabel>
        <AiPanel
          available={aiAvailable}
          conceptImages={conceptImagesAvailable() && classifierAvailable()}
          signedIn={signedIn}
          initialRemaining={remaining}
        />
      </div>

      <MonoLabel size="xs" className="mt-10 block">
        Every design is rebuilt, repaired and slice-checked server-side before
        it can be ordered — if it quotes, it prints.
      </MonoLabel>
    </main>
  );
}
