"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Swords, Zap, Timer, Crown, Target, Activity, ShieldAlert } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { battleSocket, type BattleEvent } from "@/lib/socket";
import { Badge, Button, DominanceBar, Panel, PanelTitle, Select, useToast, useWallet } from "@/lib/ui";
import { BuffsPanel } from "./buffs-panel";

interface BattleSummary { id: string; region: { name: string } }
interface War {
  id: string; type: string;
  attackerCountry: { name: string; flagColor: string } | null;
  defenderCountry: { name: string; flagColor: string };
  attackerWins: number; defenderWins: number;
  battles: BattleSummary[];
}
interface TopFighter { citizen: { id: string; nickname: string }; side: string; damage: number }
interface BattleDetail {
  battle: { id: string; roundNumber: number; status: string; attackerCountryId: string; defenderCountryId: string };
  wall: number;
  topFighters: TopFighter[];
}
interface HitResult { damage: number; crit: boolean; missed: boolean; avoided: boolean; weaponsUsed: number; hpUsed: number }
interface StorageEntry { product: string; quality: number; quantity: number }
interface LogEntry { id: number; text: string; type: "crit" | "hit" | "miss" | "system" | "def"; time: string }

const AMMO_TIERS = [
  { q: 0, label: "Unarmed", icon: "✊", mult: "1.0×" },
  { q: 1, label: "Q1 Ammo", icon: "🔫", mult: "+10%" },
  { q: 2, label: "Q2 Ammo", icon: "🗡️", mult: "+27.5%" },
  { q: 3, label: "Q3 Ammo", icon: "⚔️", mult: "+45%" },
  { q: 4, label: "Q4 Ammo", icon: "🎯", mult: "+62.5%" },
  { q: 5, label: "Q5 Ammo", icon: "🚀", mult: "+80%" },
];

export default function FightPage() {
  const search = useSearchParams();
  const { push } = useToast();
  const { refresh } = useWallet();
  const [battleId, setBattleId] = useState<string | null>(search.get("battle"));
  const [side, setSide] = useState<"ATTACKER" | "DEFENDER">("ATTACKER");
  const [weapon, setWeapon] = useState<number>(1);
  const [burst, setBurst] = useState<1 | 5>(1);
  const [wall, setWall] = useState(50);
  const [round, setRound] = useState<{ number: number; endsAt: string } | null>(null);
  const [myDamage, setMyDamage] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([{ id: 1, text: "Systems loaded. Tactical command online.", type: "system", time: "—" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: wars } = useApi<War[]>("/wars");
  const { data: detail, reload } = useApi<BattleDetail>(battleId ? `/wars/battles/${battleId}` : null, [battleId]);
  const { data: storage } = useApi<StorageEntry[]>("/citizens/me/storage");

  useEffect(() => {
    if (!battleId && wars && wars.length > 0) {
      const first = wars.flatMap((w) => w.battles.map((b) => b.id))[0];
      if (first) setBattleId(first);
    }
  }, [wars, battleId]);

  useEffect(() => {
    if (detail) setWall(detail.wall);
  }, [detail]);

  useEffect(() => {
    if (!battleId) return;
    const s = battleSocket();
    s.connect();
    s.emit("battle:join", { battleId });
    const onEvent = (e: BattleEvent) => {
      if (e.battleId !== battleId) return;
      setWall(e.wall);
      setRound({ number: e.roundNumber, endsAt: e.endsAt });
      for (const h of e.hits) {
        const who = h.missed ? "MISS" : `${h.damage.toLocaleString()} dmg${h.crit ? " 💥" : ""}${h.avoided ? " ◌no HP" : ""}`;
        setLogs((prev) => [{
          id: Date.now() + Math.random(),
          text: `${e.side === "ATTACKER" ? "⚔" : "🛡"} ${e.mode === "BERSERK" ? "×5" : "×1"} — ${who}`,
          type: h.missed ? "miss" : h.crit ? "crit" : e.side === "ATTACKER" ? "hit" : "def",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        } as LogEntry, ...prev].slice(0, 16));
      }
    };
    s.on("battle:event", onEvent);
    return () => {
      s.emit("battle:leave", { battleId });
      s.off("battle:event", onEvent);
      s.disconnect();
    };
  }, [battleId]);

  const weapons = useMemo(
    () => Object.fromEntries((storage ?? []).filter((s) => s.product === "AMMO").map((s) => [s.quality, s.quantity])),
    [storage],
  );
  const warInfo = useMemo(
    () => (wars ?? []).find((w) => w.battles.some((b) => b.id === battleId)),
    [wars, battleId],
  );
  const regionName = warInfo?.battles.find((b) => b.id === battleId)?.region.name ?? "…";

  async function fight() {
    if (!battleId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ wall: number; hits: HitResult[]; totalDamage: number; hpUsed: number }>(`/wars/battles/${battleId}/fight`, {
        method: "POST",
        body: { side, mode: burst === 5 ? "BERSERK" : "SINGLE", weaponQuality: weapon > 0 ? weapon : undefined },
      });
      setWall(res.wall);
      setMyDamage((d) => d + res.totalDamage);
      for (const h of res.hits) {
        setLogs((prev) => [{
          id: Date.now() + Math.random(),
          text: `🫵 YOU — ${h.missed ? "MISS" : h.damage.toLocaleString() + " dmg"}${h.crit ? " 💥CRITICAL!" : ""} (−${h.hpUsed} HP)`,
          type: h.missed ? "miss" : h.crit ? "crit" : "hit",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        } as LogEntry, ...prev].slice(0, 16));
      }
      const crit = res.hits.some((h) => h.crit);
      push(`Hit for ${res.totalDamage.toLocaleString()} damage! (−${res.hpUsed} HP)`, crit ? "success" : "info");
      reload();
      refresh();
    } catch (e) {
      setErr((e as Error).message);
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const remaining = round ? Math.max(0, new Date(round.endsAt).getTime() - Date.now()) : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* WAR SELECTOR */}
      <Panel className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Active Frontlines ({(wars ?? []).flatMap((w) => w.battles).length})
        </div>
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(wars ?? []).flatMap((w) =>
            w.battles.map((b) => (
              <button
                key={b.id}
                onClick={() => setBattleId(b.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 border transition ${
                  battleId === b.id
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {w.type === "RESISTANCE" ? "🔥 RW" : "⚔"} {b.region.name}
              </button>
            )),
          )}
          {(wars ?? []).length === 0 && <p className="text-xs text-slate-500">No active fronts — start a resistance war on the Map page.</p>}
        </div>
      </Panel>

      {err && <Panel className="p-3 text-xs text-red-300">{err}</Panel>}

      {/* COMBAT STIMULANTS */}
      <BuffsPanel />

      {/* ARENA */}
      {detail && (
        <Panel className="p-6 relative overflow-hidden space-y-6 shadow-2xl" glow>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-950 text-red-400 border border-red-800">
                {warInfo?.type === "RESISTANCE" ? "Resistance War" : warInfo?.type === "CIVIL" ? "Civil War" : "Direct War"}
              </span>
              <h2 className="text-xl font-black text-slate-100">Battle for {regionName}</h2>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-slate-400">Round <strong className="text-slate-200">{round?.number ?? detail.battle.roundNumber} / 15</strong></div>
              <div className="text-amber-400 font-mono font-bold">Time Left: {Math.floor(remaining / 3600000)}h {Math.floor((remaining % 3600000) / 60000)}m</div>
            </div>
          </div>

          {/* SIDES + DOMINANCE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-black">
              <div className="flex items-center gap-2 text-red-400">
                <span className="text-2xl">⚔</span>
                <span>ATTACKER</span>
                <span className="text-xs text-slate-500 font-mono">({Math.round(wall)}%)</span>
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                Dominance
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="text-xs text-slate-500 font-mono">({Math.round(100 - wall)}%)</span>
                <span>DEFENDER</span>
                <span className="text-2xl">🛡</span>
              </div>
            </div>
            <DominanceBar attackerPct={wall} />
          </div>

          {/* COMBAT CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* SIDE + WEAPON */}
            <div className="space-y-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Side & Weapon Tier</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["ATTACKER", "DEFENDER"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`py-1.5 rounded-lg text-[11px] font-bold border transition ${
                      side === s ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-500"
                    }`}
                  >
                    {s === "ATTACKER" ? "⚔ Attack" : "🛡 Defend"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {AMMO_TIERS.map((w) => {
                  const count = w.q === 0 ? "∞" : String(weapons[w.q] ?? 0);
                  return (
                    <button
                      key={w.q}
                      onClick={() => setWeapon(w.q)}
                      className={`p-1.5 rounded-lg border text-center transition ${
                        weapon === w.q ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-sm">{w.icon}</span>
                      <span className="block text-[9px] font-bold">{w.mult}</span>
                      <span className="block text-[8px] text-slate-600">×{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BURST + FIGHT */}
            <div className="space-y-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Hit Burst</label>
                <div className="flex items-center gap-2">
                  {[1, 5].map((m) => (
                    <button
                      key={m}
                      onClick={() => setBurst(m as 1 | 5)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        burst === m ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                    >
                      {m === 1 ? "1× Fight" : "5× Berserk"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  {burst === 1 ? "−10 HP · 1 weapon" : "−50 HP · 5 weapons (discount gear → 3–4)"}
                </p>
              </div>
              <Button variant="combat" className="w-full py-4 text-base" onClick={fight} disabled={busy}>
                <Swords className="w-5 h-5 animate-pulse" /> {busy ? "STRIKING…" : `FIGHT FOR ${side === "ATTACKER" ? "ATTACKER" : "DEFENDER"}`}
              </Button>
            </div>

            {/* COMBAT LOG */}
            <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-2 flex flex-col h-56 md:h-auto overflow-hidden">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span>Live Combat Log</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs font-mono">
                {logs.map((log) => (
                  <div key={log.id} className="text-[11px] leading-tight flex items-start gap-1.5 border-b border-slate-900 pb-1">
                    <span className="text-slate-600 shrink-0">{log.time}</span>
                    <span className={
                      log.type === "crit" ? "text-amber-300 font-bold" :
                      log.type === "hit" ? "text-emerald-300" :
                      log.type === "def" ? "text-rose-300" :
                      log.type === "miss" ? "text-slate-500" : "text-slate-400"
                    }>
                      {log.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* TOP FIGHTERS */}
      {detail && (
        <Panel>
          <PanelTitle icon={<Crown size={14} className="text-amber-400" />}>Top fighters — this battle</PanelTitle>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm">
            {(detail.topFighters ?? []).slice(0, 12).map((t, i) => (
              <div key={t.citizen.id + t.side} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-2">
                <span className={t.side === "ATTACKER" ? "text-red-300" : "text-emerald-300"}>
                  {i + 1}. {t.citizen.nickname}
                </span>
                <span className="text-slate-400 font-mono">{t.damage.toLocaleString()}</span>
              </div>
            ))}
            {(detail.topFighters.length ?? 0) === 0 && <p className="text-xs text-slate-500">No damage recorded yet.</p>}
          </div>
        </Panel>
      )}
    </div>
  );
}
