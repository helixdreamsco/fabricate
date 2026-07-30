"use client";
import * as React from "react";
import { UploadCloud, X } from "lucide-react";
import { MonoLabel } from "@/components/ui/MonoLabel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type PrintabilityReport = {
  minFeatureMm: number;
  ok: boolean;
  scaleToFixt: number;
  thickenMm: number;
};

export type UploadedAsset = {
  assetId: string;
  filename: string;
  shapeCount: number;
  autoOutlined: boolean;
  printability: PrintabilityReport;
};

/**
 * Logo upload: drag-drop or picker, flat 2D preview of the SANITISED file,
 * then the live 3D preview picks it up once it's placed on the part.
 *
 * The preview deliberately renders the stored sanitised SVG (fetched back
 * from the server) rather than the local file. If the two ever differed, the
 * user would be approving artwork we aren't going to print.
 */
export function AssetControl({
  label,
  value,
  targetMm,
  onChange,
}: {
  label: string;
  value: string;
  /** Logo area on the part, so printability is judged at real print size. */
  targetMm: number;
  onChange: (assetId: string) => void;
}) {
  const [asset, setAsset] = React.useState<UploadedAsset | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [fixing, setFixing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Re-check printability when the logo area changes (a bigger tag can
  // rescue artwork that was too fine on a small one).
  React.useEffect(() => {
    if (!value || !asset) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/design/assets/${value}?format=geometry&targetMm=${targetMm}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setAsset((a) => (a ? { ...a, printability: data.printability } : a));
        }
      } catch {
        /* the server re-checks authoritatively at build time */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMm, value]);

  const upload = async (file: File, opts: { autoOutline?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("targetMm", String(targetMm));
      if (opts.autoOutline === false) form.append("autoOutline", "false");
      const res = await fetch("/api/design/assets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Upload failed.");
        return;
      }
      setAsset(data as UploadedAsset);
      onChange(data.assetId);
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPick = (file: File | null) => {
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
      setError("That's not an SVG. Export your logo as SVG and try again.");
      return;
    }
    void upload(file);
  };

  const clear = () => {
    setAsset(null);
    setError(null);
    onChange("");
  };

  const report = asset?.printability;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <MonoLabel size="sm">{label}</MonoLabel>
        {asset ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 transition-colors hover:text-black"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        ) : (
          <MonoLabel size="xs">SVG · max 2 MB</MonoLabel>
        )}
      </div>

      {!value ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onPick(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            dragging
              ? "border-black/40 bg-black/[0.03]"
              : "border-black/15 hover:border-black/30",
          )}
        >
          <UploadCloud className="h-5 w-5 text-black/35" />
          <MonoLabel size="xs">
            {busy ? "Checking your logo…" : "Drop an SVG or click to choose"}
          </MonoLabel>
          <input
            ref={inputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-black/[0.08] bg-white p-3">
          <div className="flex items-center gap-3">
            {/* Flat preview of the sanitised file, sandboxed. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/design/assets/${value}`}
              alt={asset?.filename ?? "Logo"}
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-light text-black">
                {asset?.filename ?? "Logo"}
              </p>
              <MonoLabel size="xs" className="block">
                {asset?.shapeCount ?? 0} shape{asset?.shapeCount === 1 ? "" : "s"}
                {report ? ` · thinnest ${report.minFeatureMm.toFixed(2)} mm` : ""}
              </MonoLabel>
            </div>
          </div>

          {asset?.autoOutlined ? (
            <MonoLabel size="xs" className="mt-2 block">
              Outline-only artwork — we converted the strokes to solid shapes.
              Check the preview.
            </MonoLabel>
          ) : null}

          {report && !report.ok ? (
            <div className="mt-3 rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/[0.07] p-3">
              <MonoLabel size="xs" muted={false} className="block text-[#b45309]">
                Fine details are {report.minFeatureMm.toFixed(2)} mm — below the
                1 mm a printer can hold. These will close up or disappear.
              </MonoLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={fixing}
                  onClick={async () => {
                    setFixing(true);
                    try {
                      const res = await fetch(
                        `/api/design/assets/${value}?format=geometry&targetMm=${targetMm}`,
                      );
                      const data = await res.json();
                      // Thickening is applied at build time from the stored
                      // geometry; here we just confirm it would be enough.
                      setAsset((a) =>
                        a ? { ...a, printability: data.printability } : a,
                      );
                    } finally {
                      setFixing(false);
                    }
                  }}
                >
                  Thicken fine details
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                >
                  Upload a bolder version
                </Button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <MonoLabel size="xs" muted={false} className="mt-2 block text-[#ef4444]">
          {error}
        </MonoLabel>
      ) : null}
    </div>
  );
}
