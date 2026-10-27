"use client";

import { Medal, Trophy, CheckCircle2, Target } from "lucide-react";
import { useApi } from "@/lib/api";
import { Badge, Panel, PanelTitle, StatBar } from "@/lib/ui";

interface Achievement {
  id: string;
  key: string;
  target: number;
  progress: number;
  completedAt: string | null;
}
interface Subcategory {
  subcategory: string;
  total: number;
  completed: number;
  complete: boolean;
  rewardGold: number;
  items: Achievement[];
}

const LABELS: Record<string, string> = {
  MILITARY: "Military",
  ECONOMY: "Economy",
  MEDALS: "Medals",
  INVITER: "Recruiter",
  COMMUNITY: "Community",
  POLITICS: "Politics",
  GAME_SUPPORT: "Game Support",
  EVENTS: "Events",
  GENERAL: "General",
  WEAPON_ATTACHMENTS: "Weapon Attachments",
};

function humanize(key: string) {
  return key
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AchievementsPage() {
  const { data, error } = useApi<{ subcategories: Subcategory[] }>("/citizens/me/achievements");
  const subs = data?.subcategories ?? [];
  const done = subs.filter((s) => s.complete).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Panel className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-600 to-yellow-500 rounded-xl shadow-lg shadow-amber-500/20">
            <Medal className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100 tracking-wide">Achievements</h1>
            <p className="text-xs text-slate-400">10 subcategories — complete a full set for its gold reward.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="gold">
            <Trophy size={11} /> {done}/{subs.length} sets complete
          </Badge>
          <Badge color="emerald">+2g per completed set</Badge>
        </div>
      </Panel>

      {error && <Panel className="p-4 text-xs text-red-300">{error}</Panel>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subs.map((sub) => {
          const pct = sub.total > 0 ? Math.round((sub.completed / sub.total) * 100) : 0;
          return (
            <Panel key={sub.subcategory}>
              <PanelTitle
                icon={<Target size={13} className={sub.complete ? "text-amber-400" : "text-emerald-400"} />}
                right={
                  sub.complete ? (
                    <Badge color="gold">
                      <CheckCircle2 size={11} /> complete +{sub.rewardGold}g
                    </Badge>
                  ) : (
                    <Badge color="slate">
                      {sub.completed}/{sub.total}
                    </Badge>
                  )
                }
              >
                {LABELS[sub.subcategory] ?? humanize(sub.subcategory)}
              </PanelTitle>
              <div className="p-4 space-y-3">
                <StatBar value={pct} max={100} gradient={sub.complete ? "from-amber-500 to-yellow-400" : "from-emerald-500 to-teal-400"} />
                <div className="space-y-1">
                  {sub.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-sm"
                    >
                      <span className={it.completedAt ? "text-emerald-300 font-semibold" : "text-slate-300"}>
                        {it.completedAt && <CheckCircle2 size={12} className="inline mr-1 text-emerald-400 -mt-0.5" />}
                        {humanize(it.key)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {Math.min(Number(it.progress), Number(it.target)).toLocaleString()} / {Number(it.target).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {sub.items.length === 0 && <p className="text-xs text-slate-500">No achievements tracked in this set yet.</p>}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {subs.length === 0 && !error && (
        <Panel className="p-6 text-center text-sm text-slate-500">Loading achievement tracks…</Panel>
      )}
    </div>
  );
}
