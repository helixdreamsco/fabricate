import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { VerifyEmailLanding } from "./VerifyEmailLanding";

export const dynamic = "force-dynamic";

type Search = { searchParams?: Promise<{ token?: string }> };

export default async function VerifyEmailPage({ searchParams }: Search) {
  const sp = (await searchParams) ?? {};
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <div className="flex-1 bg-grid-none flex items-center justify-center py-16">
      <div className="w-full max-w-md px-5">
        <div className="text-center mb-10">
          <MonoLabel size="md" className="mb-3 block !text-black">
            Fabricate · Verify email
          </MonoLabel>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Confirming your email
          </h1>
        </div>
        <Card className="p-8">
          {token ? (
            <VerifyEmailLanding token={token} />
          ) : (
            <p className="text-sm font-light text-red-700">
              Verification link is missing or malformed. Sign up again from{" "}
              <Link
                href="/account"
                className="underline underline-offset-2"
              >
                the sign-in page
              </Link>
              .
            </p>
          )}
        </Card>
        <div className="mt-8 text-center">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
