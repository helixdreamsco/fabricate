import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { SignInCard } from "@/components/auth/SignInCard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { auth } from "@/auth";

type Search = { searchParams?: Promise<{ callbackUrl?: string | string[] }> };

export default async function AccountPage({ searchParams }: Search) {
  const session = await auth();
  const q = (await searchParams) ?? {};
  const raw = q.callbackUrl;
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") ? raw : "/";

  return (
    <div className="flex-1 bg-grid-none flex items-center justify-center py-16">
      <div className="w-full max-w-md px-5">
        {session?.user ? (
          <SignedInView
            name={session.user.name ?? null}
            email={session.user.email ?? null}
            image={session.user.image ?? null}
          />
        ) : (
          <SignedOutView callbackUrl={callbackUrl} />
        )}

        <div className="mt-8 text-center">
          <MonoLabel size="sm" className="block">
            By signing in you agree to the{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-black"
            >
              Terms
            </Link>{" "}
            &{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-black"
            >
              Privacy
            </Link>{" "}
            policies
          </MonoLabel>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Fabricate
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignedOutView({ callbackUrl }: { callbackUrl: string }) {
  return (
    <>
      <div className="text-center mb-10">
        <MonoLabel size="md" className="mb-3 block !text-black">
          Fabricate · Sign in
        </MonoLabel>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
          One account. One click.
        </h1>
        <p className="mt-4 text-sm font-light text-black/55 max-w-sm mx-auto leading-relaxed">
          {callbackUrl === "/"
            ? "Sign in with Google and your orders, addresses and receipts follow you to every device."
            : "Sign in to finish what you started — we'll drop you back where you left off."}
        </p>
      </div>
      <Card className="p-8">
        <SignInCard callbackUrl={callbackUrl} />
      </Card>
    </>
  );
}

function SignedInView({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  return (
    <>
      <div className="text-center mb-10">
        <MonoLabel size="md" className="mb-3 block !text-black">
          Signed in
        </MonoLabel>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
          Welcome back{name ? `, ${name.split(" ")[0]}` : ""}.
        </h1>
      </div>
      <Card className="p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={name ?? email ?? "Account"}
              className="w-12 h-12 rounded-full border border-black/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center font-black">
              {(name ?? email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-semibold truncate">
              {name ?? "No display name"}
            </span>
            <span className="text-[12px] font-mono text-black/55 truncate">
              {email ?? "—"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusDot tone="ready" />
            <MonoLabel size="sm" className="!text-black">
              Active
            </MonoLabel>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/"
            className="px-4 py-3 rounded-xl border border-black/10 hover:border-black/30 bg-white text-center transition-colors"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/45">
              Upload
            </div>
            <div className="text-sm font-medium mt-1">New print</div>
          </Link>
          <Link
            href="/track"
            className="px-4 py-3 rounded-xl border border-black/10 hover:border-black/30 bg-white text-center transition-colors"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/45">
              Track
            </div>
            <div className="text-sm font-medium mt-1">An order</div>
          </Link>
          <Link
            href="/account/affiliate"
            className="col-span-2 px-4 py-3 rounded-xl border border-black/10 hover:border-black/30 bg-white text-center transition-colors"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/45">
              Affiliate
            </div>
            <div className="text-sm font-medium mt-1">Code &amp; rewards</div>
          </Link>
        </div>

        <div className="pt-4 border-t border-black/[0.06] flex justify-end">
          <SignOutButton />
        </div>
      </Card>
    </>
  );
}
