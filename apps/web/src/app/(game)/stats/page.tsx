"use client";

import { useMemo, useState } from "react";
import { BarChart3, Flag, Shield, Users, CalendarDays, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { useApi } from "@/lib/api";
import { Badge, Panel, PanelTitle, StatBar, Tabs } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";

interface CountryRow { id: string; name: string; code: string; flagColor: string; damage: number }
interface ArmyRow {
  id: string; name: string; countryId: string; levelIdx: number; memberSlots: number;
  gold: number; recruitmentOpen: boolean; _count: { members: number };
}
interface CitizenRow {
  id: string; nickname: string; level: number; totalDamage: number;
  citizenshipCountry: { id: string; name: string; code: string; flagColor: string };
}
interface RollupRow { id: string; ownerType: string; ownerId: string; day: number; damage: number; hits: number; name: string }
interface PublicCountry { id: string; name: string; code: string; flagColor: string }
interface DailyTasks { day: number }

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function rankBadge(i: number) {
  return i < 3 ? (
    <span className="text-sm w-6 text-center">{RANK_MEDALS[i]}</span>
  ) : (
    <span className="text-[11px] font-mono text-slate-500 w-6 text-center">{i + 1}</span>
  );
}

function flagDot(color: string) {
  return <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block border border-slate-700" style={{ background: color }} />;
}

export default function StatsPage() {
  const [tab, setTab] = useState<"countries" | "armies" | "citizens" | "daily">("countries");
  const { data: tasks } = useApi<DailyTasks>("/actions/daily-tasks");
  const currentDay = tasks?.day ?? 1;
  const [viewDay, setViewDay] = useState<number | null>(null);
  const day = viewDay ?? currentDay;

  const { data: countries } = useApi<CountryRow[]>("/stats/countries");
  const { data: armies } = useApi<ArmyRow[]>("/stats/armies");
  const { data: citizens } = useApi<CitizenRow[]>("/stats/citizens");
  const { data: allCountries } = useApi<PublicCountry[]>("/auth/countries");
  const { data: rollup } = useApi<RollupRow[]>(`/stats/daily?day=${day}`, [day]);

  const maxCountryDamage = Math.max(1, ...(countries ?? []).map((c) => Number(c.damage)));
  const countryName = (id: string) => (allCountries ?? []).find((c) => c.id === id);

  // Filters: citizens by country, daily rollup by owner type
  const [citizenCountry, setCitizenCountry] = useState("all");
  const [rollupType, setRollupType] = useState("all");
  const filteredCitizens = useMemo(
    () => (citizens ?? []).filter((c) => citizenCountry === "all" || c.citizenshipCountry.id === citizenCountry),
    [citizens, citizenCountry],
  );
  const filteredRollup = useMemo(
    () => (rollup ?? []).filter((r) => rollupType === "all" || r.ownerType === rollupType),
    [rollup, rollupType],
  );
  const rollupTypes = useMemo(() => [...new Set((rollup ?? []).map((r) => r.ownerType))].sort(), [rollup]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Panel className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-cyan-600 to-blue-500 rounded-xl shadow-lg shadow-cyan-500/20">
            <BarChart3 className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100 tracking-wide">Statistics</h1>
            <p className="text-xs text-slate-400">Global leaderboards · damage counters by day, country, army and citizen.</p>
          </div>
        </div>
        <Badge color="cyan">
          <CalendarDays size={11} /> Day {currentDay}
        </Badge>
      </Panel>

      <Panel className="p-5 space-y-4">
        <Tabs
          tabs={[
            { id: "countries", label: "Countries" },
            { id: "armies", label: "Armies" },
            { id: "citizens", label: "Citizens" },
            { id: "daily", label: "Daily rollup" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "countries" && (
          <div className="space-y-1.5">
            {(countries ?? []).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
                {rankBadge(i)}
                {flagDot(c.flagColor)}
                <span className="flex-1 text-sm font-bold text-slate-200">{c.name}</span>
                <span className="w-40 hidden sm:block">
                  <StatBar value={Number(c.damage)} max={maxCountryDamage} gradient="from-cyan-500 to-blue-400" height="h-2" />
                </span>
                <span className="font-mono text-sm text-cyan-300 w-28 text-right">{Number(c.damage).toLocaleString()}</span>
              </div>
            ))}
            {(countries ?? []).length === 0 && <p className="text-xs text-slate-500">No damage recorded yet — fight on the battlefield to feed the counters.</p>}
          </div>
        )}

        {tab === "armies" && (
          <div className="space-y-1.5">
            {(armies ?? []).map((a, i) => {
              const c = countryName(a.countryId);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
                  {rankBadge(i)}
                  <Shield size={13} className="text-emerald-400 shrink-0" />
                  <span className="flex-1 text-sm font-bold text-slate-200">{a.name}</span>
                  {c && (
                    <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: c.flagColor }}>
                      {flagDot(c.flagColor)} {c.name}
                    </span>
                  )}
                  <Badge color="slate">lvl {a.levelIdx + 1}</Badge>
                  <Badge color="cyan">
                    <Users size={10} /> {a._count.members}/{a.memberSlots}
                  </Badge>
                  <span className="font-mono text-sm text-amber-300 w-24 text-right">{(Number(a.gold) / 100).toFixed(2)}g</span>
                </div>
              );
            })}
            {(armies ?? []).length === 0 && <p className="text-xs text-slate-500">No military units founded yet.</p>}
          </div>
        )}

        {tab === "citizens" && (
          <div className="space-y-1.5">
            <FilterBar count={filteredCitizens.length}>
              <FilterSelect
                label="country"
                value={citizenCountry}
                onChange={setCitizenCountry}
                options={[{ value: "all", label: "all" }, ...(allCountries ?? []).map((c) => ({ value: c.id, label: c.name }))]}
              />
            </FilterBar>
            {filteredCitizens.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
                {rankBadge(i)}
                {i === 0 && <Crown size={13} className="text-amber-400 shrink-0" />}
                <span className="flex-1 text-sm font-bold text-slate-200">{c.nickname}</span>
                <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: c.citizenshipCountry.flagColor }}>
                  {flagDot(c.citizenshipCountry.flagColor)} {c.citizenshipCountry.code}
                </span>
                <Badge color="slate">L{c.level}</Badge>
                <span className="font-mono text-sm text-red-300 w-28 text-right">{Number(c.totalDamage).toLocaleString()}</span>
              </div>
            ))}
            {(citizens ?? []).length === 0 && <p className="text-xs text-slate-500">No citizens ranked yet.</p>}
          </div>
        )}

        {tab === "daily" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewDay(Math.max(1, day - 1))}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                title="Previous day"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-sm font-bold font-mono text-cyan-300 w-20 text-center">Day {day}</span>
              <button
                onClick={() => setViewDay(Math.min(currentDay, day + 1))}
                disabled={day >= currentDay}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40"
                title="Next day"
              >
                <ChevronRight size={14} />
              </button>
              <span className="text-[10px] text-slate-600">day {currentDay} is live — counters update as battles are fought</span>
            </div>
            <FilterBar count={filteredRollup.length}>
              <FilterSelect
                label="owner"
                value={rollupType}
                onChange={setRollupType}
                options={[
                  { value: "all", label: "all" },
                  ...rollupTypes.map((t) => ({ value: t, label: t.toLowerCase() })),
                ]}
              />
            </FilterBar>
            <div className="space-y-1.5">
              {filteredRollup.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2">
                  <span className="text-[11px] font-mono text-slate-500 w-6 text-center">{i + 1}</span>
                  <Badge color={r.ownerType === "COUNTRY" ? "cyan" : r.ownerType === "CITIZEN" ? "emerald" : r.ownerType === "ALLIANCE" ? "purple" : "gold"}>
                    {r.ownerType.toLowerCase()}
                  </Badge>
                  <span className="flex-1 text-sm font-bold text-slate-200">{r.name}</span>
                  <span className="font-mono text-xs text-slate-500">{r.hits} hits</span>
                  <span className="font-mono text-sm text-cyan-300 w-28 text-right">{Number(r.damage).toLocaleString()}</span>
                </div>
              ))}
              {(rollup ?? []).length === 0 && (
                <p className="text-xs text-slate-500">No activity on day {day}.</p>
              )}
              {filteredRollup.length === 0 && (rollup ?? []).length > 0 && (
                <p className="text-xs text-slate-500">No entries match your filter.</p>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
