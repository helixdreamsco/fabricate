"use client";
import * as React from "react";
import { Search, X, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRINTER_MODELS, searchPrinters, fullName, type PrinterModel } from "@/lib/printer-models";

/**
 * Searchable printer-model picker for the maker profile form.
 *
 * Behaviour:
 *   - Search filters by brand + model + aliases (so "X1 Carbon" finds X1C).
 *   - Click a result to set the value to "Brand Model".
 *   - If the maker's printer isn't on the list, the input value itself is
 *     submitted as-is — they can type anything. We surface a "Use ‘…’ as
 *     a custom model" pill at the bottom of the dropdown when the query
 *     doesn't exactly match a known model.
 *   - If the picked printer is multi-material capable (msColor), we surface
 *     an "AMS hint" so the maker can toggle the AMS checkbox in one click.
 */
export function PrinterModelSearch({
  value,
  onChange,
  onAmsHint,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Optional callback fired when picking a known multi-material printer.
   *  Lets the parent suggest enabling the AMS toggle. */
  onAmsHint?: (suggested: boolean) => void;
}) {
  const [query, setQuery] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Keep query synced if the parent flips value externally (form reset etc.).
  React.useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  const results = React.useMemo(() => searchPrinters(query), [query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, PrinterModel[]>();
    for (const p of results) {
      if (!map.has(p.brand)) map.set(p.brand, []);
      map.get(p.brand)!.push(p);
    }
    return [...map.entries()];
  }, [results]);

  const exactMatch = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return PRINTER_MODELS.find((p) => fullName(p).toLowerCase() === q) ?? null;
  }, [query]);

  function pick(p: PrinterModel) {
    const label = fullName(p);
    onChange(label);
    setQuery(label);
    setOpen(false);
    if (p.msColor) onAmsHint?.(true);
  }

  function pickCustom(s: string) {
    onChange(s.trim());
    setQuery(s.trim());
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35 pointer-events-none"
          strokeWidth={2.2}
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click inside the panel registers before close.
            setTimeout(() => {
              setOpen(false);
              // If user typed a value and didn't click a result, commit the
              // raw text so free-form printer names are kept.
              if (query.trim() !== value) onChange(query.trim());
            }, 150);
          }}
          placeholder="e.g. Bambu X1C, Prusa MK4S, Voron 2.4…"
          className="w-full bg-transparent border border-black/15 rounded-lg pl-8 pr-9 py-2 text-sm font-light outline-none focus:border-black/50 transition-colors"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear printer model"
            onMouseDown={(e) => e.preventDefault()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-black/[0.06] transition-colors"
          >
            <X className="w-3 h-3 text-black/50" strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-black/[0.08] bg-white shadow-md divide-y divide-black/[0.04]">
          {grouped.length === 0 ? null : (
            grouped.map(([brand, ps]) => (
              <div key={brand}>
                <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-black/45 bg-black/[0.02] sticky top-0">
                  {brand}
                </div>
                {ps.map((p) => {
                  const label = fullName(p);
                  const selected = value === label;
                  return (
                    <button
                      type="button"
                      key={label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(p)}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-black/[0.04] transition-colors flex items-center gap-2",
                        selected && "bg-black/[0.04]"
                      )}
                    >
                      <span className="flex-1 text-sm">
                        {p.model}
                        {p.msColor ? (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 font-mono text-[9px] uppercase tracking-[0.16em] align-middle">
                            AMS
                          </span>
                        ) : null}
                      </span>
                      {selected ? (
                        <Check className="w-3.5 h-3.5 text-black/65 shrink-0" strokeWidth={2.4} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          {/* Custom-value escape hatch — lets makers type anything not on the list. */}
          {query.trim() && !exactMatch ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickCustom(query)}
              className="w-full text-left px-3 py-2 hover:bg-black/[0.04] transition-colors flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5 text-black/55 shrink-0" strokeWidth={2.4} />
              <span className="text-sm">
                Use <span className="font-medium">“{query.trim()}”</span> as your printer
              </span>
            </button>
          ) : null}
          {grouped.length === 0 && !query.trim() ? (
            <div className="px-3 py-4 text-center text-sm font-light text-black/45">
              Start typing to search.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
