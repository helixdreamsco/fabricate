import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Card } from "@/components/ui/Card";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex-1 bg-grid-none flex items-center justify-center py-16">
      <div className="w-full max-w-md px-5">
        <div className="text-center mb-10">
          <MonoLabel size="md" className="mb-3 block !text-black">
            Fabricate · Reset password
          </MonoLabel>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Forgot your password?
          </h1>
          <p className="mt-4 text-sm font-light text-black/55 max-w-sm mx-auto leading-relaxed">
            Enter the email you signed up with and we&rsquo;ll send a reset
            link. Valid for one hour.
          </p>
        </div>
        <Card className="p-8">
          <ForgotPasswordForm />
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
