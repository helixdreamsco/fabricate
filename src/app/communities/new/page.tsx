import { CreateCommunityForm } from "@/components/community/CreateCommunityForm";
import { MonoLabel } from "@/components/ui/MonoLabel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewCommunityPage() {
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[800px] mx-auto px-5 md:px-8 py-10 md:py-14">
        <Link
          href="/communities"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black transition-colors mb-6"
        >
          <ArrowLeft className="w-3 h-3" />
          Communities
        </Link>
        <MonoLabel size="md" className="mb-3 block">
          Create a community
        </MonoLabel>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.05] mb-8">
          Name it. Pick the rules.
          <br />
          <span className="text-black/45">Invite people.</span>
        </h1>

        <CreateCommunityForm />
      </div>
    </div>
  );
}
