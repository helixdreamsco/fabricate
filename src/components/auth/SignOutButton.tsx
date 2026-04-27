"use client";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export function SignOutButton({
  variant = "secondary",
}: {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Button
      type="button"
      size="md"
      variant={variant}
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </Button>
  );
}
