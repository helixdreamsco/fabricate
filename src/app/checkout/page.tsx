import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CheckoutForm } from "./CheckoutForm";

/**
 * /checkout is gated by `src/middleware.ts` so unauthenticated users are
 * redirected to /account?callbackUrl=/checkout before this component ever
 * renders. The redirect below is a belt-and-braces fallback in case
 * middleware is disabled (e.g. static export).
 */
export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/account?callbackUrl=/checkout");
  }
  return (
    <CheckoutForm
      signedIn
      prefillEmail={session.user.email ?? ""}
      prefillName={session.user.name ?? ""}
      avatarUrl={session.user.image ?? null}
    />
  );
}
