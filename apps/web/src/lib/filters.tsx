"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "./ui";

/** Debounced search input — type freely, filters apply after 250ms. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <div className={cn("relative", className)}>
      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? "search…"}
        className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/80 pl-8 pr-7 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
      />
      {draft && (
        <button
          type="button"
          onClick={() => setDraft("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
          title="Clear"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** Labeled dropdown filter. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={cn("flex items-center gap-1.5 shrink-0", className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-slate-800 bg-slate-950/80 px-2 text-sm text-slate-200 focus:border-emerald-500/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Labeled numeric input filter (price cap, min salary, …). */
export function FilterNumber({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex items-center gap-1.5 shrink-0", className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder ?? "—"}
        inputMode="decimal"
        className="h-9 w-20 rounded-lg border border-slate-800 bg-slate-950/80 px-2 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
      />
    </label>
  );
}

/** Toggle chip filter (e.g. "recruitment open", "jobs I qualify for"). */
export function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "h-9 rounded-lg border px-2.5 text-[11px] font-bold transition shrink-0",
        checked
          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
          : "border-slate-800 bg-slate-950/80 text-slate-500 hover:text-slate-200",
      )}
    >
      {label}
    </button>
  );
}

/** Container for a filter row with an optional live result count. */
export function FilterBar({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
      {children}
      {count !== undefined && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {count} result{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/** Case-insensitive substring match helper for search filters. */
export function matches(haystack: string | null | undefined, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack ?? "").toLowerCase().includes(needle.trim().toLowerCase());
}
