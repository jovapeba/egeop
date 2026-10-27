"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckCircle2, Zap, X } from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(minor: number | string | null | undefined): string {
  const v = Number(minor ?? 0);
  return (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------

type ToastType = "info" | "success" | "warning" | "error";
interface Toast { id: number; message: string; type: ToastType }

const ToastCtx = createContext<{ push: (message: string, type?: ToastType) => void }>({ push: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-3 text-xs font-semibold animate-in slide-in-from-right duration-300",
              t.type === "error" ? "bg-red-950/90 border-red-500/60 text-red-200" :
              t.type === "warning" ? "bg-amber-950/90 border-amber-500/60 text-amber-200" :
              t.type === "success" ? "bg-emerald-950/90 border-emerald-500/60 text-emerald-200" :
              "bg-blue-950/90 border-blue-500/60 text-blue-200",
            )}
          >
            {t.type === "error" && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
            {t.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {t.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.type === "info" && <Zap className="w-5 h-5 text-cyan-400 shrink-0" />}
            <span>{t.message}</span>
            <button
              className="ml-auto text-slate-500 hover:text-slate-200"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Primitives (e-STRAT look: slate-950 glass panels, emerald accents)
// ---------------------------------------------------------------------------

export function Panel({ children, className, glow }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={cn(
      "bg-slate-900/80 border border-slate-800/90 rounded-2xl backdrop-blur-md",
      glow && "shadow-xl shadow-emerald-950/20",
      className,
    )}>
      {children}
    </div>
  );
}

export function PanelTitle({ children, icon, right }: { children: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-slate-800/80">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        {icon}
        {children}
      </div>
      {right}
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger" | "success" | "combat";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    default: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-600/20",
    outline: "bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700",
    ghost: "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
    danger: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-600 text-white shadow-lg shadow-red-600/30 border border-red-400/30",
    success: "bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-lg",
    combat: "bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 text-white font-black shadow-xl shadow-red-600/30 border border-red-400/30",
  } as const;
  const sizes = { sm: "h-7 px-2.5 text-[11px]", md: "h-9 px-4 text-xs font-bold", lg: "h-11 px-6 text-sm" } as const;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  color = "slate",
  className,
}: {
  children: React.ReactNode;
  color?: "slate" | "emerald" | "gold" | "red" | "cyan" | "purple";
  className?: string;
}) {
  const colors = {
    slate: "bg-slate-950 text-slate-400 border-slate-800",
    emerald: "bg-emerald-950 text-emerald-400 border-emerald-800/60",
    gold: "bg-amber-950 text-amber-400 border-amber-800/60",
    red: "bg-red-950 text-red-400 border-red-800/60",
    cyan: "bg-cyan-950 text-cyan-400 border-cyan-800/60",
    purple: "bg-purple-950 text-purple-400 border-purple-800/60",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border", colors[color], className)}>
      {children}
    </span>
  );
}

export function StatBar({
  value,
  max,
  className,
  gradient = "from-emerald-500 to-teal-400",
  height = "h-2.5",
}: {
  value: number;
  max: number;
  className?: string;
  gradient?: string;
  height?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(0.0001, max)) * 100));
  return (
    <div className={cn("w-full bg-slate-950 border border-slate-800 rounded-full overflow-hidden p-0.5", height, className)}>
      <div className={cn("h-full rounded-full transition-all duration-500 bg-gradient-to-r", gradient)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Tug-of-war dominance bar: attacker (red) vs defender (emerald) with center marker. */
export function DominanceBar({ attackerPct }: { attackerPct: number }) {
  return (
    <div className="h-6 w-full bg-red-950 rounded-full border border-slate-800 overflow-hidden flex relative p-1">
      <div
        className="bg-gradient-to-r from-red-600 to-red-500 h-full rounded-l-full transition-all duration-500"
        style={{ width: `${attackerPct}%` }}
      />
      <div
        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-r-full transition-all duration-500"
        style={{ width: `${100 - attackerPct}%` }}
      />
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/50 -translate-x-1/2 z-10" />
    </div>
  );
}

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "h-9 w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none",
      props.className,
    )}
    {...props}
  />
);

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={cn(
      "w-full rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none",
      props.className,
    )}
    {...props}
  />
);

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={cn(
      "h-9 w-full rounded-lg border border-slate-800 bg-slate-950/80 px-2 text-sm text-slate-200 focus:border-emerald-500/60 focus:outline-none",
      props.className,
    )}
    {...props}
  />
);

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-950/80 border border-slate-800 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
            value === t.id ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40" : "text-slate-500 hover:text-slate-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Wallet refresh hook kept for page compatibility. */
export const WalletCtx = createContext<{ refresh: () => void }>({ refresh: () => undefined });
export const useWallet = () => useContext(WalletCtx);

// --- Back-compat aliases for pages being migrated to the tactical style ------

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 backdrop-blur-md", className)}>{children}</div>;
}
export function CardTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-slate-800/80 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
      {icon}
      {children}
    </div>
  );
}
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return <StatBar value={value} max={100} height={className?.includes("h-3") ? "h-3.5" : "h-2.5"} />;
}
