import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Settings, Layers } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { BackLink } from "@/components/shell/BackLink";
import { PRINTER_MODELS, fullName } from "@/lib/printer-models";
import { parsePrinterMaterials } from "@/lib/printers";
import { PrinterIllustration } from "@/components/maker/PrinterIllustration";
import { SpoolsForm, type SpoolInput } from "./SpoolsForm";

export const dynamic = "force-dynamic";

export default async function PrinterDetailPage({
  params,
}: {
  params: Promise<{ printerId: string }>;
}) {
  const { printerId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/account?callbackUrl=/maker/printers/${printerId}`);

  const printer = await prisma.printer.findUnique({
    where: { id: printerId },
    include: {
      maker: { select: { userId: true } },
      spools: { orderBy: [{ status: "asc" }, { material: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!printer || printer.maker.userId !== session.user.id) notFound();

  const catalogueEntry = PRINTER_MODELS.find(
    (p) => fullName(p) === printer.printerModel,
  );
  const materials = parsePrinterMaterials(printer.materials);
  const initialSpools: SpoolInput[] = printer.spools.map((s) => ({
    id: s.id,
    material: s.material,
    brand: s.brand ?? "",
    colorName: s.colorName,
    colorHex: s.colorHex,
    status: s.status as SpoolInput["status"],
    notes: s.notes ?? "",
  }));

  return (
    <div className="flex-1 bg-grid-none">
      <div className="max-w-[960px] mx-auto px-5 md:px-8 py-8 md:py-10">
        <BackLink href="/maker/profile" label="Back to maker profile" />

        {/* Header — illustration + identity */}
        <Card className="overflow-hidden mb-5">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-0">
            <div className="bg-black/[0.025] border-b md:border-b-0 md:border-r border-black/[0.06] flex items-center justify-center p-6">
              <PrinterIllustration className="w-44 h-auto" active={printer.active} />
            </div>
            <div className="p-6 flex flex-col gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                Printer · priority {printer.priority + 1}
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
                {printer.displayName}
              </h1>
              <div className="text-sm font-light text-black/65">
                {printer.printerModel || (
                  <span className="text-black/40">No model selected</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Pill on={printer.active}>
                  {printer.active ? "Active" : "Offline"}
                </Pill>
                {printer.hasAMS ? <Pill on>AMS / multi-material</Pill> : null}
                {catalogueEntry?.brand ? (
                  <Pill>{catalogueEntry.brand}</Pill>
                ) : null}
              </div>
              <div className="mt-3">
                <Link
                  href="/maker/profile"
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-black underline underline-offset-4"
                >
                  <Settings className="w-3 h-3" /> Edit name, model, materials
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {/* Materials snapshot */}
        <Card className="p-5 mb-5">
          <div className="flex items-center gap-2 text-black/65 mb-2">
            <Layers className="w-3.5 h-3.5" strokeWidth={2.2} />
            <MonoLabel size="sm" className="!text-black/65">
              Materials this printer stocks
            </MonoLabel>
          </div>
          {materials.length === 0 ? (
            <p className="text-sm font-light text-black/55">
              No specific materials selected — this printer is treated as
              willing to print any material.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {materials.map((m) => (
                <span
                  key={m}
                  className="px-3 py-1 rounded-full bg-black/[0.05] font-mono text-[10px] uppercase tracking-[0.16em] text-black/65"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Inventory */}
        <SpoolsForm printerId={printer.id} initial={initialSpools} />
      </div>
    </div>
  );
}

function Pill({
  children,
  on,
}: {
  children: React.ReactNode;
  on?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-[0.18em] " +
        (on
          ? "bg-[#7c3aed]/[0.10] text-[#7c3aed]"
          : "bg-black/[0.05] text-black/65")
      }
    >
      {children}
    </span>
  );
}
