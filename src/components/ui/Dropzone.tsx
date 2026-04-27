"use client";
import * as React from "react";
import { cn, formatBytes } from "@/lib/utils";
import { UploadCloud, FileBox } from "lucide-react";

export type AcceptedFile = {
  file: File;
};

type Props = {
  onFile: (f: File) => void;
  accept?: string[];
  className?: string;
  helperText?: string;
  compact?: boolean;
};

export function Dropzone({
  onFile,
  accept = [".stl", ".3mf", ".obj", ".step", ".stp"],
  className,
  helperText,
  compact,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const validateAndEmit = (f: File) => {
    setError(null);
    const ext = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (!accept.includes(ext)) {
      setError(`Unsupported file type ${ext}. Accepted: ${accept.join(", ")}.`);
      return;
    }
    if (f.size > 80 * 1024 * 1024) {
      setError("File larger than 80 MB is not supported in the demo.");
      return;
    }
    onFile(f);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) validateAndEmit(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative bg-white rounded-2xl border border-dashed cursor-pointer transition-all",
          compact ? "px-6 py-8" : "px-8 py-16 md:py-24",
          dragging
            ? "border-black/60 bg-black/[0.02]"
            : "border-black/15 hover:border-black/35",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndEmit(f);
          }}
        />
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="relative">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl border border-black/10 bg-white flex items-center justify-center transition-all",
                dragging ? "scale-110" : "group-hover:scale-105",
              )}
            >
              {dragging ? (
                <FileBox className="w-6 h-6 text-black" />
              ) : (
                <UploadCloud className="w-6 h-6 text-black/70" />
              )}
            </div>
            {dragging ? (
              <div className="absolute inset-0 rounded-2xl ring-2 ring-black/20 pulse-soft pointer-events-none" />
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <div
              className={cn(
                "font-black tracking-tight text-black",
                compact ? "text-lg" : "text-2xl md:text-3xl",
              )}
            >
              {dragging ? "Drop to analyse" : "Drop your STL"}
            </div>
            <div className="text-sm font-light text-black/50 max-w-md">
              {helperText ?? (
                <>
                  …or click to browse. We accept{" "}
                  <span className="font-mono text-black/70 tracking-wide">
                    {accept.join("  /  ")}
                  </span>
                  . Max 80&nbsp;MB.
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-black/35">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              Analysed in your browser · nothing uploaded yet
            </div>
          </div>
        </div>
      </div>
      {error ? (
        <div className="mt-3 text-[12px] text-[#ef4444] font-mono">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function FilePill({
  file,
  onRemove,
}: {
  file: File;
  onRemove?: () => void;
}) {
  const ext = file.name.split(".").pop()?.toUpperCase() ?? "";
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white pl-1 pr-4 py-1">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0a0a0a] text-white font-mono text-[9px] tracking-wider">
        {ext}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-medium truncate max-w-[260px]">
          {file.name}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-black/40">
          {formatBytes(file.size)}
        </span>
      </div>
      {onRemove ? (
        <button
          onClick={onRemove}
          className="ml-1 text-black/35 hover:text-black text-xs"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
