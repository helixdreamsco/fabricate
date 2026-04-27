"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function JoinWithCodeInline() {
  const router = useRouter();
  const [code, setCode] = React.useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim();
        if (!c) return;
        router.push(`/j/${c}`);
      }}
      className="flex items-end gap-3 max-w-lg"
    >
      <label className="flex flex-col gap-2 flex-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
          Invite code or link
        </span>
        <Input
          mono
          placeholder="e.g. k7p3n9m2q4 or paste the full /j/... link"
          value={code}
          onChange={(e) => {
            const v = e.target.value;
            // If user pasted a full URL, extract the code after /j/
            const m = v.match(/\/j\/([a-z0-9-]+)/i);
            setCode(m ? m[1] : v);
          }}
        />
      </label>
      <Button type="submit" size="md" withArrow disabled={!code.trim()}>
        Join
      </Button>
    </form>
  );
}
