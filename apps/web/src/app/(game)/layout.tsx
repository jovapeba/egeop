"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Swords, Briefcase, Package, Globe, Newspaper, Shield, Coins, Landmark, Users, Home,
  LogOut, Menu, X, Heart, Award, MapPin, Clock, Radio, CheckCircle2, Bell, Zap,
  Gavel, FileText, Trophy, Medal, Siren, BarChart3, UserRound,
} from "lucide-react";
import { api, getToken, setToken, onAuthChange, useApi } from "@/lib/api";
import { Badge, Button, StatBar, ToastProvider, cn, formatMoney, useToast } from "@/lib/ui";
import { NationalChat } from "@/components/national-chat";
import { LEVEL_XP } from "@egeopolis/game-core";

const HP_MAX = 500; // v2 economy: 500 HP cap, +100/hour

const NAV: Array<{ href: string; label: string; icon: typeof Shield; hot?: boolean; staff?: boolean }> = [
  { href: "/dashboard", label: "Command Deck", icon: Home },
  { href: "/fight", label: "Battlefield Fronts", icon: Swords, hot: true },
  { href: "/mu", label: "Military Units", icon: Shield },
  { href: "/work", label: "Work & Economy", icon: Briefcase },
  { href: "/market", label: "Market & Storage", icon: Package },
  { href: "/monetary", label: "Monetary Exchange", icon: Coins },
  { href: "/companies", label: "Companies", icon: Users },
  { href: "/equipment", label: "Equipment", icon: Award },
  { href: "/wars", label: "Map & Wars", icon: Globe },
  { href: "/politics", label: "Politics & Gov", icon: Landmark },
  { href: "/media", label: "Media & Press", icon: Newspaper },
  { href: "/auctions", label: "Auction House", icon: Gavel },
  { href: "/contracts", label: "Contracts & Loans", icon: FileText },
  { href: "/events", label: "Tournaments", icon: Trophy },
  { href: "/achievements", label: "Achievements", icon: Medal },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/stats", label: "Statistics", icon: BarChart3 },
  { href: "/staff", label: "Staff Deck", icon: Siren, staff: true },
];

interface Me {
  id: string;
  nickname: string; level: number; xp: number; hp: number; strength: number; ecoSkill: number;
  isAdmin: boolean;
  totalDamage: number; firstAidKits: number; gold: number;
  walletFiat: number;
  militaryRank: { name: string; bonusPct: number };
  citizenshipCountry: { id: string; name: string; code: string; flagColor: string; currencyName: string; currencySymbol: string };
  locationRegion: { id: string; name: string };
  foodLimit: number; energyLimit: number;
  referralCode: string;
}
interface Tasks {
  day: number;
  worked: boolean;
  trained: boolean;
  foodUsed: number;
  foodLimit: number;
  energyUsed: number;
  energyLimit: number;
  pantryDaysLeft: number;
  fridgeDaysLeft: number;
  adWatchUsed: boolean;
}
interface StorageEntry { product: string; quality: number; quantity: number }

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { push } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: me, error, reload } = useApi<Me>("/auth/me");
  const { data: tasks, reload: reloadTasks } = useApi<Tasks>("/actions/daily-tasks");
  const { data: storage, reload: reloadStorage } = useApi<StorageEntry[]>("/citizens/me/storage");
  const [busy, setBusy] = useState(false);

  const [selectedFoodQuality, setSelectedFoodQuality] = useState<number>(1);
  const [selectedDrinkQuality, setSelectedDrinkQuality] = useState<number>(1);

  // Customizable sidebar: up to 5 user-selected shortcut keys (spec §5.3).
  const [shortcuts, setShortcuts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("nf_shortcuts") ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("nf_shortcuts", JSON.stringify(shortcuts)); } catch { /* ignore */ }
  }, [shortcuts]);
  const toggleShortcut = (href: string) =>
    setShortcuts((s) => (s.includes(href) ? s.filter((x) => x !== href) : s.length >= 5 ? s : [...s, href]));

  const foodStock = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of storage ?? []) {
      if (s.product === "FOOD" && s.quality >= 1 && s.quality <= 5) {
        map[s.quality] = (map[s.quality] ?? 0) + Number(s.quantity);
      }
    }
    return map;
  }, [storage]);

  const drinkStock = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const s of storage ?? []) {
      if (s.product === "ENERGY_DRINK" && s.quality >= 1 && s.quality <= 5) {
        map[s.quality] = (map[s.quality] ?? 0) + Number(s.quantity);
      }
    }
    return map;
  }, [storage]);

  // Auto-pick highest available quality if currently selected quality has 0 stock
  useEffect(() => {
    if (storage && storage.length > 0) {
      if (foodStock[selectedFoodQuality] === 0) {
        const best = [5, 4, 3, 2, 1].find((q) => (foodStock[q] ?? 0) > 0);
        if (best) setSelectedFoodQuality(best);
      }
      if (drinkStock[selectedDrinkQuality] === 0) {
        const best = [5, 4, 3, 2, 1].find((q) => (drinkStock[q] ?? 0) > 0);
        if (best) setSelectedDrinkQuality(best);
      }
    }
  }, [storage, foodStock, drinkStock, selectedFoodQuality, selectedDrinkQuality]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const unsub = onAuthChange((token) => {
      if (!token) {
        router.replace("/login");
      }
    });
    return unsub;
  }, [router]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Session expired — <a href="/login" className="ml-1 text-emerald-400">sign in</a>
      </main>
    );
  }
  if (!me || !tasks) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">Systems loading…</main>;
  }

  async function eat(kind: "FOOD" | "ENERGY_DRINK" | "FIRST_AID_KIT", quality = 1) {
    setBusy(true);
    try {
      await api("/actions/consume", { method: "POST", body: { kind, quality, qty: 1 } });
      if (kind === "FIRST_AID_KIT") {
        push("First Aid Kit used — +100 HP!", "success");
      } else {
        push(`Restored +${10 * quality} HP with Q${quality} ${kind === "FOOD" ? "Food" : "Energy Drink"}!`, "success");
      }
      reload();
      reloadTasks();
      reloadStorage();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const nextXp = xpToReach(me.level + 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md flex-shrink-0">
        <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              title="Toggle Citizen Panel"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 border border-cyan-500/30 shadow-[0_0_12px_rgba(56,189,248,0.35)] group-hover:scale-105 transition-transform flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="eGEOPOLIS"
                  width={36}
                  height={36}
                  className="h-8 w-8 object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center">
                  <span className="text-base sm:text-lg font-black tracking-wider bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
                    eGEOPOLIS
                  </span>
                  <span className="hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 ml-2 bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 rounded tracking-wider">
                    MMO
                  </span>
                </div>
                <span className="hidden sm:block text-[9px] font-semibold text-slate-400 tracking-widest -mt-1 uppercase">
                  Strategy • Nations • Power
                </span>
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-6 bg-slate-950/70 px-4 py-1.5 rounded-full border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-mono">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Day <strong className="text-emerald-300 font-bold">{tasks.day}</strong></span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-2 text-slate-300">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-slate-400">Server: <strong className="text-emerald-400 font-semibold">Online</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button className="relative p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition" onClick={() => router.push("/dashboard")}>
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full" />
            </button>
            <Button size="sm" variant="ghost" onClick={() => { setToken(null); router.push("/login"); }}>
              <LogOut size={14} />
            </Button>
          </div>
        </div>

        {/* TOPBAR NAVIGATION */}
        <nav className="w-full border-t border-slate-800/70 bg-slate-950/80 px-2 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none">
            {NAV.filter((n) => !n.staff || me.isAdmin).map((n) => {
              const active = pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                    active
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10 font-bold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent",
                  )}
                >
                  <n.icon className={cn("w-3.5 h-3.5", active ? "text-emerald-400" : "text-slate-400")} />
                  <span>{n.label}</span>
                  {n.hot && (
                    <span className="text-[9px] font-black px-1.5 py-0.2 bg-red-950 text-red-400 border border-red-800/70 rounded-full animate-pulse">
                      HOT
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="flex-1 flex w-full relative">
        {/* SIDEBAR */}
        <aside className={cn(
          "fixed lg:static inset-y-0 left-0 z-30 w-80 bg-slate-900/95 border-r border-slate-800/80 backdrop-blur-xl flex flex-col transition-transform duration-300 shrink-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}>
          <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-60px)]">
            {/* PLAYER CARD */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-xl">
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div
                    className="w-14 h-14 rounded-2xl border-2 border-emerald-400/50 flex items-center justify-center font-black text-xl shadow-lg"
                    style={{ background: `linear-gradient(135deg, ${me.citizenshipCountry.flagColor}, #0f172a)` }}
                  >
                    {me.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 font-black text-xs px-1.5 py-0.5 rounded-full border-2 border-slate-950">
                    {me.level}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-100 text-sm truncate">{me.nickname}</h3>
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" /> {me.militaryRank.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">{me.locationRegion.name}</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Citizenship:</span>
                <span className="font-bold" style={{ color: me.citizenshipCountry.flagColor }}>
                  {me.citizenshipCountry.flagColor} {me.citizenshipCountry.name}
                </span>
              </div>
            </div>

            {/* HEALTH & FOOD */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 fill-emerald-400" /> Health / Energy
                </span>
                <span className="font-mono text-slate-300 font-bold">{Math.round(me.hp)} / 500</span>
              </div>
              <StatBar value={me.hp} max={HP_MAX} height="h-3" />

              {/* FOOD RATIONS */}
              <div className="pt-2 space-y-2 border-t border-slate-900">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-300 flex items-center gap-1">
                    <span>🍞</span> Food Rations
                  </span>
                  <span className={cn(
                    "font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border",
                    tasks.foodUsed >= tasks.foodLimit
                      ? "bg-red-950/60 text-red-400 border-red-800/50"
                      : "bg-emerald-950/60 text-emerald-300 border-emerald-800/50",
                  )}>
                    {tasks.foodUsed}/{tasks.foodLimit} used
                  </span>
                </div>

                {/* Quality selector */}
                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((q) => {
                    const count = foodStock[q] ?? 0;
                    const isSelected = selectedFoodQuality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setSelectedFoodQuality(q)}
                        className={cn(
                          "flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border text-center transition-all",
                          isSelected
                            ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm shadow-emerald-500/30 font-bold scale-[1.02]"
                            : count > 0
                            ? "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                            : "bg-slate-950/40 border-slate-800/40 text-slate-600 opacity-60 hover:opacity-100",
                        )}
                        title={`Food Q${q} (+${10 * q} HP) — ${count} in stock`}
                      >
                        <span className="text-[11px] font-mono leading-tight">Q{q}</span>
                        <span className={cn(
                          "text-[9px] font-mono mt-0.5 truncate max-w-full px-0.5",
                          count > 0 ? (isSelected ? "text-emerald-400 font-bold" : "text-slate-400") : "text-slate-600",
                        )}>
                          {count > 999 ? "999+" : count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Eat Food Button */}
                <button
                  onClick={() => eat("FOOD", selectedFoodQuality)}
                  disabled={busy || me.hp >= HP_MAX || (foodStock[selectedFoodQuality] ?? 0) <= 0 || tasks.foodUsed >= tasks.foodLimit}
                  className={cn(
                    "w-full py-2 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                    me.hp >= HP_MAX
                      ? "bg-slate-800 text-slate-400 border border-slate-700/50"
                      : tasks.foodUsed >= tasks.foodLimit
                      ? "bg-slate-800 text-slate-400 border border-slate-700/50"
                      : (foodStock[selectedFoodQuality] ?? 0) <= 0
                      ? "bg-slate-800/80 text-slate-400 border border-slate-800"
                      : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black shadow-emerald-500/20",
                  )}
                >
                  <Heart className={cn("w-3.5 h-3.5", (foodStock[selectedFoodQuality] ?? 0) > 0 && me.hp < HP_MAX && tasks.foodUsed < tasks.foodLimit ? "fill-slate-950" : "fill-slate-500")} />
                  {me.hp >= HP_MAX
                    ? "HP FULL"
                    : tasks.foodUsed >= tasks.foodLimit
                    ? "FOOD LIMIT REACHED"
                    : (foodStock[selectedFoodQuality] ?? 0) <= 0
                    ? `NO Q${selectedFoodQuality} IN STORAGE`
                    : `EAT FOOD Q${selectedFoodQuality} (+${10 * selectedFoodQuality} HP)`}
                </button>
              </div>
            </div>

            {/* ENERGY DRINKS */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" /> Energy Drinks
                </span>
                <span className={cn(
                  "font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border",
                  tasks.energyUsed >= tasks.energyLimit
                    ? "bg-red-950/60 text-red-400 border-red-800/50"
                    : "bg-cyan-950/60 text-cyan-300 border-cyan-800/50",
                )}>
                  {tasks.energyUsed}/{tasks.energyLimit} used
                </span>
              </div>

              {/* Quality selector */}
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((q) => {
                  const count = drinkStock[q] ?? 0;
                  const isSelected = selectedDrinkQuality === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSelectedDrinkQuality(q)}
                      className={cn(
                        "flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border text-center transition-all",
                        isSelected
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/30 font-bold scale-[1.02]"
                          : count > 0
                          ? "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                          : "bg-slate-950/40 border-slate-800/40 text-slate-600 opacity-60 hover:opacity-100",
                      )}
                      title={`Energy Drink Q${q} (+${10 * q} HP) — ${count} in stock`}
                    >
                      <span className="text-[11px] font-mono leading-tight">Q{q}</span>
                      <span className={cn(
                        "text-[9px] font-mono mt-0.5 truncate max-w-full px-0.5",
                        count > 0 ? (isSelected ? "text-cyan-400 font-bold" : "text-slate-400") : "text-slate-600",
                      )}>
                        {count > 999 ? "999+" : count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Drink Energy Button */}
              <button
                onClick={() => eat("ENERGY_DRINK", selectedDrinkQuality)}
                disabled={busy || me.hp >= HP_MAX || (drinkStock[selectedDrinkQuality] ?? 0) <= 0 || tasks.energyUsed >= tasks.energyLimit}
                className={cn(
                  "w-full py-2 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                  me.hp >= HP_MAX
                    ? "bg-slate-800 text-slate-400 border border-slate-700/50"
                    : tasks.energyUsed >= tasks.energyLimit
                    ? "bg-slate-800 text-slate-400 border border-slate-700/50"
                    : (drinkStock[selectedDrinkQuality] ?? 0) <= 0
                    ? "bg-slate-800/80 text-slate-400 border border-slate-800"
                    : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold shadow-cyan-500/20",
                )}
              >
                <Zap className="w-3.5 h-3.5" />
                {me.hp >= HP_MAX
                  ? "HP FULL"
                  : tasks.energyUsed >= tasks.energyLimit
                  ? "DRINK LIMIT REACHED"
                  : (drinkStock[selectedDrinkQuality] ?? 0) <= 0
                  ? `NO Q${selectedDrinkQuality} IN STORAGE`
                  : `DRINK Q${selectedDrinkQuality} (+${10 * selectedDrinkQuality} HP)`}
              </button>

              {/* Medkit if owned */}
              {me.firstAidKits > 0 && (
                <button
                  onClick={() => eat("FIRST_AID_KIT")}
                  disabled={busy}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <span>🩹</span> USE FAK ({me.firstAidKits} available)
                </button>
              )}
            </div>

            {/* XP */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-cyan-400">Level {me.level} XP</span>
                <span className="font-mono text-slate-400 text-[11px]">{me.xp} / {nextXp}</span>
              </div>
              <StatBar value={me.xp} max={nextXp} gradient="from-cyan-500 to-blue-500" />
            </div>

            {/* COMBAT STATS */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Combat Stats</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Strength:</span>
                  <span className="text-amber-300 font-mono font-bold text-sm">{Math.round(me.strength * 10) / 10}</span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Eco Skill:</span>
                  <span className="text-cyan-300 font-mono font-bold text-sm">{me.ecoSkill.toFixed(2)}</span>
                </div>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400 text-[10px]">Total Damage:</span>
                <span className="text-red-400 font-mono font-bold">{Number(me.totalDamage).toLocaleString()}</span>
              </div>
            </div>

            {/* TREASURY */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Treasury & Balances</div>
              <div className="flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800/80">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <span>🪙</span> Gold
                </span>
                <span className="text-xs font-mono font-bold text-amber-300">{formatMoney(me.gold)}g</span>
              </div>
              <div className="flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800/80">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5" title={`Native currency: ${me.citizenshipCountry.currencyName}`}>
                  <span>{me.citizenshipCountry.currencySymbol || "◈"}</span>
                  <span className="truncate max-w-[90px]">{me.citizenshipCountry.currencyName}</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-300">{formatMoney(me.walletFiat)}</span>
              </div>
            </div>


            {/* QUICK LAUNCH — customizable shortcuts */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Quick Launch</span>
                <span className="text-slate-600">{shortcuts.length}/5</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shortcuts.map((href) => {
                  const n = NAV.find((x) => x.href === href);
                  if (!n) return null;
                  return (
                    <button
                      key={href}
                      type="button"
                      onClick={() => router.push(href)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/60 text-[10px] font-bold text-slate-300 hover:text-white transition"
                    >
                      <n.icon className="w-3 h-3 text-emerald-400" /> {n.label}
                    </button>
                  );
                })}
                {shortcuts.length === 0 && <p className="text-[10px] text-slate-600">Pin up to 5 views below.</p>}
              </div>
              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-900">
                {NAV.filter((n) => !shortcuts.includes(n.href) && (!n.staff || me.isAdmin)).slice(0, 8).map((n) => (
                  <button
                    key={n.href}
                    type="button"
                    onClick={() => toggleShortcut(n.href)}
                    title={`Pin ${n.label}`}
                    className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800/60 text-slate-500 hover:text-emerald-300 hover:border-emerald-500/40 text-[9px] font-bold transition"
                  >
                    + {n.label.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* DAILY DUTIES */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Daily Orders</span>
                <span className="text-amber-400">Day {tasks.day}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => router.push("/work")}
                  className={cn(
                    "p-2 rounded-xl border text-[11px] font-bold transition flex flex-col items-center gap-1",
                    tasks.worked ? "bg-slate-900 border-slate-800 text-slate-600" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200",
                  )}
                >
                  <span>Work</span>
                  {tasks.worked ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-cyan-400">−10 HP</span>}
                </button>
                <button
                  onClick={() => router.push("/work")}
                  className={cn(
                    "p-2 rounded-xl border text-[11px] font-bold transition flex flex-col items-center gap-1",
                    tasks.trained ? "bg-slate-900 border-slate-800 text-slate-600" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200",
                  )}
                >
                  <span>Train</span>
                  {tasks.trained ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-amber-400">+5 STR</span>}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* REALTIME NATIONAL COMMS DECK */}
      <NationalChat
        myCitizenshipCountry={me.citizenshipCountry}
        myCitizenId={me.id}
        myNickname={me.nickname}
      />
    </div>
  );
}

function xpToReach(level: number): number {
  const idx = Math.min(level - 1, LEVEL_XP.length - 1);
  return LEVEL_XP[idx] ?? LEVEL_XP[LEVEL_XP.length - 1];
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Shell>{children}</Shell>
    </ToastProvider>
  );
}
