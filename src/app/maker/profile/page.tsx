import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { MaterialKey } from "@/lib/catalog";
import { BackLink } from "@/components/shell/BackLink";
import { ProfileForm } from "./ProfileForm";

function parseMaterials(s: string | null): MaterialKey[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (m): m is MaterialKey =>
        m === "PLA" || m === "PETG" || m === "ABS" || m === "TPU",
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
    include: {
      printers: { orderBy: { priority: "asc" } },
      pickupLocations: { orderBy: { ordering: "asc" } },
    },
  });
  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[720px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <BackLink href="/maker" label="Back to dashboard" />
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 mb-3">
          Maker · profile
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] mb-6">
          {profile ? "Edit your maker profile" : "Set up your maker profile"}
        </h1>
        <p className="text-sm font-light text-black/60 leading-relaxed mb-8 max-w-lg">
          This is what creators see when they consider your bid. List every
          printer you&rsquo;d take jobs on — the top one wins auto-selection
          when more than one of yours can fulfil a job. To accept paid jobs
          you&rsquo;ll also need to onboard for payouts (separate step on
          the Payouts page).
        </p>
        <ProfileForm
          initial={
            profile
              ? {
                  displayName: profile.displayName,
                  bio: profile.bio ?? "",
                  freeCompletionPhoto: profile.freeCompletionPhoto,
                  printers:
                    profile.printers.length > 0
                      ? profile.printers.map((p) => ({
                          id: p.id,
                          displayName: p.displayName,
                          printerModel: p.printerModel,
                          hasAMS: p.hasAMS,
                          materials: parseMaterials(p.materials),
                          active: p.active,
                          notes: p.notes ?? "",
                        }))
                      : [
                          {
                            displayName: "",
                            printerModel: "",
                            hasAMS: false,
                            materials: [],
                            active: true,
                            notes: "",
                          },
                        ],
                  // Pickup locations come from the new PickupLocation table
                  // (primary first). Fall back to the legacy postcode mirror
                  // if a profile exists but has no rows yet — keeps the form
                  // pre-populated for makers signed up before the migration.
                  locations:
                    profile.pickupLocations.length > 0
                      ? profile.pickupLocations.map((l) => ({
                          id: l.id,
                          label: l.label ?? "",
                          postcode: l.postcode,
                          notes: l.notes ?? "",
                        }))
                      : profile.postcode
                        ? [{ label: "", postcode: profile.postcode, notes: "" }]
                        : [{ label: "", postcode: "", notes: "" }],
                }
              : null
          }
        />
      </div>
    </div>
  );
}
