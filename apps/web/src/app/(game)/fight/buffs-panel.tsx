"use client";

import { useState } from "react";
import { Zap, Timer, ShieldAlert, Syringe } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Panel, PanelTitle, useToast, useWallet } from "@/lib/ui";

interface ActiveBuff {
  type: string;
  buffed: boolean;
  buffUntil: string;
  debuffed: boolean;
  debuffUntil: string;
  description: string;
  damageBonus: number;
}

const BUFFS = [
  { type: "STEROID", icon: "💉", label: "Steroid", desc: "+10% damage for 24h" },
  { type: "RAMBO", icon: "🔫", label: "Rambo", desc: "+10% damage with Q5 ammo for 24h" },
  { type: "PATRIOT", icon: "🛡️", label: "Patriot", desc: "+10% damage defending a core region for 24h" },
  { type: "REBEL", icon: "🔥", label: "Rebel", desc: "+10% damage in resistance wars on core regions for 24h" },
] as const;

export function BuffsPanel() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const { data: buffs, reload } = useApi<ActiveBuff[]>("/buffs/mine");
  const [busy, setBusy] = useState<string | null>(null);

  async function buy(type: string) {
    setBusy(type);
    try {
      await api("/buffs", { method: "POST", body: { type } });
      push("Buff activated — 1g spent, +10% damage for 24h!", "success");
      reload();
      refresh();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <PanelTitle icon={<Zap size={14} className="text-cyan-400" />} right={<Badge color="cyan">1g per activation</Badge>}>
        Combat Stimulants — buff 24h, then debuff
      </PanelTitle>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {BUFFS.map((b) => {
            const active = (buffs ?? []).find((x) => x.type === b.type);
            const buffed = active?.buffed;
            const debuffed = active?.debuffed;
            const isDisabled = busy === b.type || !!buffed || !!debuffed;
            return (
              <div
                key={b.type}
                className={`rounded-xl border p-3 space-y-2 ${
                  buffed ? "border-emerald-500/60 bg-emerald-950/20" : debuffed ? "border-red-800/60 bg-red-950/20" : "border-slate-800 bg-slate-950/70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{b.icon}</span>
                  {buffed && <Badge color="emerald">+10%</Badge>}
                  {debuffed && <Badge color="red">−10%</Badge>}
                </div>
                <p className="text-sm font-bold">{b.label}</p>
                <p className="text-[10px] text-slate-400 leading-snug">{b.desc}</p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={isDisabled}
                  variant={buffed ? "success" : debuffed ? "ghost" : "default"}
                  onClick={() => buy(b.type)}
                >
                  <Syringe size={12} /> {buffed ? "Active Buff" : debuffed ? "In Debuff" : "Activate — 1g"}
                </Button>
              </div>
            );
          })}
        </div>

        {(buffs ?? []).length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-800">
            {(buffs ?? []).map((b) => (
              <div key={b.type} className="flex items-center gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-1.5 text-xs">
                {b.buffed ? (
                  <Badge color="emerald">
                    <Timer size={10} /> buff
                  </Badge>
                ) : (
                  <Badge color="red">
                    <ShieldAlert size={10} /> debuff
                  </Badge>
                )}
                <span className="flex-1 text-slate-300">
                  {b.type} {b.buffed ? b.description.replace("+10% ", "") : "locked — reduced damage"}
                </span>
                <span className="font-mono text-slate-500">
                  until {new Date(b.buffed ? b.buffUntil : b.debuffUntil).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
