"use client";

import { useState } from "react";
import { Swords, Briefcase, Globe2, Landmark, Newspaper, Trophy, Copy, Dumbbell, Heart, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Panel, PanelTitle, StatBar, Tabs, useToast, useWallet } from "@/lib/ui";

interface Me {
  nickname: string; level: number; xp: number; hp: number; strength: number; ecoSkill: number;
  totalDamage: number; gold: number; medkits: number; medalCount: number;
  militaryRank: { name: string; bonusPct: number };
  citizenshipCountry: { id: string; name: string; code: string; flagColor: string; currencyName: string; treasuryGold: number };
  locationRegion: { id: string; name: string; resource: string | null; density: string };
  referralCode: string; societyBuilderCount: number;
}
interface Tasks { day: number; worked: boolean; trained: boolean; foodUsed: number; foodLimit: number; giftUsed: number; giftLimit: number; adWatchUsed?: boolean }
interface War { id: string; type: string; attackerCountry: { name: string } | null; defenderCountry: { name: string }; battles: Array<{ id: string; region: { name: string } }> }

export default function DashboardPage() {
  const router = useRouter();
  const { push } = useToast();
  const { refresh } = useWallet();
  const { data: me, reload } = useApi<Me>("/auth/me");
  const { data: tasks, reload: reloadTasks } = useApi<Tasks>("/actions/daily-tasks");
  const { data: wars } = useApi<War[]>("/wars");
  const { data: bcast } = useApi<{ broadcast: { message: string; expiresAt: string; president: { nickname: string; avatarColor: string } } | null }>("/politics/broadcast");
  const [busy, setBusy] = useState<string | null>(null);

  async function train() {
    setBusy("train");
    try {
      const res = await api<{ strengthGained: number }>("/actions/train", { method: "POST" });
      push(`Drills complete! Strength +${res.strengthGained}`, "success");
      reload(); reloadTasks(); refresh();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }
  async function work() {
    setBusy("work");
    try {
      const res = await api<{ units: number; product: string; netSalary: number }>("/actions/work", { method: "POST" });
      push(`Shift done! ${res.units}× ${res.product.toLowerCase()} · net ${res.netSalary.toFixed(2)} CC`, "success");
      reload(); reloadTasks(); refresh();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }

  if (!me || !tasks) return null;
  const activeBattle = wars?.flatMap((w) => w.battles)[0];
  const nextXp = xpToReach(me.level + 1);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {bcast?.broadcast && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-slate-900/90 p-4 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold">
              ★
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">Presidential Dispatch</span>
                <span className="text-xs text-muted">by {bcast.broadcast.president.nickname}</span>
              </div>
              <p className="mt-1 text-sm text-slate-100 font-medium whitespace-pre-wrap leading-relaxed">
                {bcast.broadcast.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STATUS GRID */}
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5 space-y-3">
          <PanelTitle icon={<Heart size={14} className="text-red-400" />}>Citizen</PanelTitle>
          <p className="text-lg font-black">{me.nickname}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge color="emerald">Level {me.level}</Badge>
            <Badge color="cyan">XP {me.xp}</Badge>
            <Badge color="gold">🎖 {me.militaryRank.name}</Badge>
            <Badge color="red">🏆 {me.medalCount} medals</Badge>
          </div>
          <div className="space-y-2 text-xs text-slate-400">
            <div className="flex justify-between font-mono"><span>Health</span><span className="text-slate-200">{Math.round(me.hp)}/100</span></div>
            <StatBar value={me.hp} max={100} />
            <div className="flex justify-between font-mono"><span>XP to L{me.level + 1}</span><span className="text-slate-200">{me.xp}/{nextXp}</span></div>
            <StatBar value={me.xp} max={nextXp} gradient="from-cyan-500 to-blue-500" />
            <div className="flex justify-between font-mono"><span>Strength</span><span className="text-amber-300">{Math.round(me.strength)}</span></div>
            <div className="flex justify-between font-mono"><span>Total damage</span><span className="text-red-400">{Number(me.totalDamage).toLocaleString()}</span></div>
          </div>
        </Panel>

        <Panel className="p-5 space-y-3">
          <PanelTitle icon={<Zap size={14} className="text-amber-400" />}>Daily orders — day {tasks.day}</PanelTitle>
          <Button className="w-full" variant={tasks.trained ? "outline" : "default"} onClick={train} disabled={tasks.trained || busy === "train"}>
            <Dumbbell size={14} /> {tasks.trained ? "Trained ✓" : "Train (+5 STR)"}
          </Button>
          <Button className="w-full" variant={tasks.worked ? "outline" : "default"} onClick={work} disabled={tasks.worked || busy === "work"}>
            <Briefcase size={14} /> {tasks.worked ? "Worked ✓" : "Work (−10 HP)"}
          </Button>
          <Button className="w-full" variant="danger" onClick={() => router.push(activeBattle ? `/fight?battle=${activeBattle.id}` : "/wars")}>
            <Swords size={14} /> {activeBattle ? "Join active battle" : "Find a war"}
          </Button>
          <div className="space-y-1.5 pt-1 text-[10px] text-slate-500">
            <div className="flex justify-between items-center font-mono">
              <span>🍛 food {tasks.foodUsed}/{tasks.foodLimit}</span>
              {!tasks.adWatchUsed && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api("/actions/watch-ad", { method: "POST" });
                      push("Sponsor ad watched! +5 Food limit added for today.", "success");
                      reloadTasks();
                    } catch (e) {
                      push((e as Error).message, "error");
                    }
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
                >
                  +5 limit (Watch ad)
                </button>
              )}
            </div>
            <StatBar value={tasks.foodUsed} max={Math.max(1, tasks.foodLimit)} height="h-1.5" />
            <div className="flex justify-between font-mono"><span>🎁 gifts</span><span>{tasks.giftUsed}/{tasks.giftLimit}</span></div>
            <StatBar value={tasks.giftUsed} max={Math.max(1, tasks.giftLimit)} height="h-1.5" gradient="from-cyan-500 to-blue-500" />
          </div>
        </Panel>

        <Panel className="p-5 space-y-3">
          <PanelTitle icon={<Trophy size={14} className="text-amber-400" />}>Country & society</PanelTitle>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Home</span><span className="font-bold" style={{ color: me.citizenshipCountry.flagColor }}>{me.citizenshipCountry.name}</span></div>
            <div className="flex justify-between"><span>Region</span><span className="text-slate-200">{me.locationRegion.name}</span></div>
            <div className="flex justify-between"><span>Treasury</span><span className="font-mono text-amber-300">{(me.citizenshipCountry.treasuryGold / 100).toFixed(2)}g</span></div>
            <div className="flex justify-between"><span>Medkits</span><span className="font-mono text-slate-200">{me.medkits}</span></div>
            <div className="flex justify-between"><span>Referrals → L7</span><span className="font-mono text-slate-200">{me.societyBuilderCount}</span></div>
          </div>
          <p className="mt-2 break-all rounded-lg bg-slate-950/80 border border-slate-800 p-2 text-[10px] text-slate-500">
            referral code: <span className="font-mono text-emerald-400">{me.referralCode}</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => router.push("/politics")}><Landmark size={12} /> Politics</Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/media")}><Newspaper size={12} /> Media</Button>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(me.referralCode); push("Referral code copied!", "info"); }}>
              <Copy size={12} />
            </Button>
          </div>
        </Panel>
      </div>

      {/* OPS BRIEFING */}
      <Panel>
        <PanelTitle icon={<Globe2 size={14} className="text-cyan-400" />}>Operations briefing</PanelTitle>
        <div className="p-4 grid gap-2 md:grid-cols-2 text-sm text-slate-400">
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2">
            <b className="text-slate-200">Active fronts:</b> {wars?.length ?? 0} wars
            {activeBattle && <> · hottest: <b className="text-red-300">{wars?.[0]?.defenderCountry.name}</b></>}
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2">
            <b className="text-slate-200">Resource here:</b>{" "}
            {me.locationRegion.resource ? `${me.locationRegion.density.toLowerCase()} ${me.locationRegion.resource.toLowerCase()}` : "none"}
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2">
            <b className="text-slate-200">Streak engine:</b> work & train every day → 30-day medals pay 5g each, infinitely.
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2">
            <b className="text-slate-200">Elections:</b> president day 5 · party leader day 15 · congress day 25 — vote from L7.
          </div>
        </div>
      </Panel>
    </div>
  );
}

function xpToReach(level: number): number {
  const base = [0, 10, 20, 30, 50, 70, 200, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000, 14000, 18000, 22000, 26000, 30000, 34000, 40000];
  if (level - 1 < base.length) return base[level - 1];
  return base[base.length - 1] + (level - base.length) * 6000;
}
