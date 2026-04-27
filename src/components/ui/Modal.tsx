"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-white w-full rounded-2xl border border-black/10 shadow-xl max-h-[90vh] flex flex-col slide-in",
          maxWidth,
        )}
      >
        {(title || subtitle) && (
          <div className="px-8 pt-8 pb-4 flex items-start justify-between gap-4 border-b border-black/[0.06]">
            <div>
              {subtitle ? (
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35 mb-2">
                  {subtitle}
                </div>
              ) : null}
              {title ? (
                <h2 className="text-2xl font-black tracking-tight">{title}</h2>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-black/40 hover:text-black hover:bg-black/[0.04] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
