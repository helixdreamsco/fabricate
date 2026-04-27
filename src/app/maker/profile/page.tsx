import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { MaterialKey } from "@/lib/catalog";
import { ProfileForm } from "./ProfileForm";

function parseMaterials(s: string | null): MaterialKey[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.filter((m): m is MaterialKey =>
      m === "PLA" || m === "PETG" || m === "ABS" || m === "TPU"
    );
  } catch {
    return [];
  }
}

export default async function MakerProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/account?callbackUrl=/maker/profile");
  const profile = await prisma.makerProfile.findUnique({
    where: { userId: session.user.id },
  });
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Maker · profile
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] mb-6">
          {profile ? "Edit your maker profile" : "Set up your maker profile"}
        </h1>
        <p className="text-sm font-light text-black/60 leading-relaxed mb-8 max-w-lg">
          This is what creators see when they consider your bid. You can edit
          it any time. To accept paid jobs you&rsquo;ll also need to onboard
          for payouts &mdash; that&rsquo;s a separate step on the Payouts page.
        </p>
        <ProfileForm
          initial={profile ? {
            displayName: profile.displayName,
            bio: profile.bio ?? "",
            postcode: profile.postcode ?? "",
            hasAMS: profile.hasAMS,
            printerModel: profile.printerModel ?? "",
            materials: parseMaterials(profile.materials),
            freeCompletionPhoto: profile.freeCompletionPhoto,
          } : null}
        />
      </div>
    </div>
  );
}
