import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  consentStatusFor,
} from "@/lib/legal";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";

type Search = { searchParams?: Promise<{ next?: string }> };

export default async function AcceptPage({ searchParams }: Search) {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/legal/accept");
  const status = await consentStatusFor(session.user.id);
  const sp = (await searchParams) ?? {};
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";

  // Already up to date — bounce.
  if (!status.needsAny) redirect(next);

  return (
    <div className="flex-1 bg-grid-none flex items-center justify-center py-16">
      <div className="w-full max-w-md px-5">
        <div className="text-center mb-6">
          <MonoLabel size="md" className="mb-3 block !text-black">
            Fabricate · Legal
          </MonoLabel>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            {status.needsTerms && status.needsPrivacy
              ? "Accept the Terms and Privacy Policy to continue."
              : status.needsTerms
                ? "We've updated the Terms of Service."
                : "We've updated the Privacy Policy."}
          </h1>
          <p className="mt-3 text-sm font-light text-black/60 leading-relaxed">
            Read each one in full and tick the boxes below. You won&rsquo;t
            be able to use the rest of Fabricate until you do.
          </p>
        </div>
        <Card className="p-6">
          <ConsentForm
            needsTerms={status.needsTerms}
            needsPrivacy={status.needsPrivacy}
            termsVersion={TERMS_VERSION}
            privacyVersion={PRIVACY_VERSION}
            redirectTo={next}
          />
        </Card>
        <div className="mt-6 text-center">
          <Link
            href="/account"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 hover:text-black underline"
          >
            Sign out instead
          </Link>
        </div>
      </div>
    </div>
  );
}
