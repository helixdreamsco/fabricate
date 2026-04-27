import Link from "next/link";
import { AccessForm } from "./AccessForm";

/**
 * Staging access gate. The whole site is fronted by `proxy.ts`, which
 * redirects unauthenticated visitors here when `STAGING_ACCESS_CODE` is
 * set. Once they enter the right code we set a long-lived cookie and
 * bounce them back to whatever they were trying to reach.
 *
 * In production (no `STAGING_ACCESS_CODE`) the gate is disabled and this
 * page is just a fallback explainer.
 */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-grid-none px-5 py-16">
      <div className="max-w-[440px] w-full">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45 mb-4 text-center">
          Fabricate · staging
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] mb-3 text-center">
          Private preview.
        </h1>
        <p className="text-sm font-light text-black/65 leading-relaxed text-center mb-8">
          This environment is for invited testers only. Enter the access
          code your team gave you to continue.
        </p>
        <AccessForm redirectTo={sp.from ?? "/"} />
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/35 mt-8 text-center leading-relaxed">
          Pre-launch · not for customers · pending legal review.{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
