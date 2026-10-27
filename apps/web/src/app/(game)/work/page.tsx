"use client";

import { useMemo, useState } from "react";
import { Briefcase, Building2, Coins, CheckCircle2, Heart, Gift, PackageOpen } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Input, Panel, PanelTitle, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect, FilterToggle, SearchInput, matches } from "@/lib/filters";

interface JobOffer { id: string; minEcoSkill: number; salary: number; company: { id: string; name: string; product: string; quality: number; region: { name: string } } }
interface Region { id: string; name: string; countryId: string }
interface Country { id: string; name: string; code: string }
interface MapPayload { regions: Region[]; countries: Country[] }
interface Tasks { day: number; worked: boolean; trained: boolean; foodUsed: number; foodLimit: number; energyUsed: number; energyLimit: number }
interface WorkResult { units: number; product: string; netSalary: number; salary: number; taxPaid: number; productivity: number; hpLost: number; ecoGained: number }
interface StorageEntry { product: string; quality: number; quantity: number }

export default function WorkPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const { data: tasks, reload: reloadTasks } = useApi<Tasks>("/actions/daily-tasks");
  const { data: jobs, reload: reloadJobs } = useApi<JobOffer[]>("/companies/jobs");
  const { data: me } = useApi<{ ecoSkill: number; citizenshipCountry: { currencyName: string } }>("/auth/me");
  const { data: map } = useApi<MapPayload>("/citizens/map");
  const { data: storage, reload: reloadStorage } = useApi<StorageEntry[]>("/citizens/me/storage");
  const [busy, setBusy] = useState<string | null>(null);

  // Job market filters
  const [jobSearch, setJobSearch] = useState("");
  const [jobCountry, setJobCountry] = useState("all");
  const [jobProduct, setJobProduct] = useState("all");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [salarySort, setSalarySort] = useState("none");

  const jobProducts = useMemo(
    () => [...new Set((jobs ?? []).map((j) => j.company.product))].sort(),
    [jobs],
  );
  const filteredJobs = useMemo(() => {
    let list = jobs ?? [];
    list = list.filter((j) => {
      if (!matches(j.company.name, jobSearch)) return false;
      if (jobProduct !== "all" && j.company.product !== jobProduct) return false;
      if (eligibleOnly && (me?.ecoSkill ?? 0) < j.minEcoSkill) return false;
      if (jobCountry !== "all") {
        const region = (map?.regions ?? []).find((r) => r.name === j.company.region.name);
        if (region?.countryId !== jobCountry) return false;
      }
      return true;
    });
    if (salarySort === "desc") list = [...list].sort((a, b) => b.salary - a.salary);
    if (salarySort === "asc") list = [...list].sort((a, b) => a.salary - b.salary);
    return list;
  }, [jobs, map, me, jobSearch, jobCountry, jobProduct, eligibleOnly, salarySort]);

  async function work() {
    setBusy("work");
    try {
      const res = await api<WorkResult>("/actions/work", { method: "POST" });
      push(`Shift finished! ${res.units}× ${res.product.toLowerCase()} produced · net ${(res.netSalary).toFixed(2)} CC (−${res.hpLost} HP, eco +${res.ecoGained})`, "success");
      reloadTasks(); refresh();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }

  async function train() {
    setBusy("train");
    try {
      const res = await api<{ strengthGained: number; strength: number }>("/actions/train", { method: "POST" });
      push(`Drills complete! Strength +${res.strengthGained} → ${res.strength.toFixed(1)}`, "success");
      reloadTasks(); refresh();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }

  async function eat(kind: "FOOD" | "ENERGY_DRINK", quality: number) {
    setBusy(`${kind}${quality}`);
    try {
      await api("/actions/consume", { method: "POST", body: { kind, quality, qty: 1 } });
      push(`+${10 * quality} HP restored!`, "success");
      reloadStorage(); reloadTasks();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }

  async function apply(offerId: string, company: string) {
    setBusy(offerId);
    try {
      await api(`/companies/jobs/${offerId}/apply`, { method: "POST" });
      push(`Applied at ${company} — hit "Work" to earn your wage.`, "success");
      reloadJobs();
    } catch (e) { push((e as Error).message, "error"); } finally { setBusy(null); }
  }

  async function quit() {
    try { await api("/companies/jobs/quit", { method: "POST" }); push("Quit job.", "info"); reloadJobs(); } catch (e) { push((e as Error).message, "error"); }
  }

  const food = (storage ?? []).filter((s) => s.product === "FOOD" && s.quantity > 0);
  const drinks = (storage ?? []).filter((s) => s.product === "ENERGY_DRINK" && s.quantity > 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* EMPLOYMENT + DAILY SHIFT */}
      <Panel className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xl">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Employment Status</div>
            <h3 className="text-lg font-bold text-slate-100">Daily Shift — Day {tasks?.day}</h3>
            <p className="text-xs text-slate-400">
              Eco skill {me?.ecoSkill?.toFixed(2) ?? "—"} · wage paid in {me?.citizenshipCountry.currencyName ?? "CC"} · income tax applies
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={work}
            disabled={tasks?.worked || busy === "work"}
            className={tasks?.worked ? "bg-slate-800 text-slate-500 shadow-none" : ""}
          >
            {tasks?.worked ? <><CheckCircle2 className="w-4 h-4" /> Shift Finished</> : <><Briefcase className="w-4 h-4" /> Work Daily Shift (−10 HP)</>}
          </Button>
          <Button
            variant="outline"
            onClick={train}
            disabled={tasks?.trained || busy === "train"}
          >
            {tasks?.trained ? "Trained ✓" : "Train (+5 STR)"}
          </Button>
          <Button
            variant="ghost"
            onClick={quit}
            disabled={(tasks as any)?.canQuitJob === false || (tasks as any)?.hasJob === false}
            title={(tasks as any)?.canQuitJob === false ? "Cannot quit on the same day you were hired" : undefined}
          >
            {(tasks as any)?.hiredToday ? "hired today (locked)" : "quit job"}
          </Button>
        </div>
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* JOB MARKET */}
        <Panel>
          <PanelTitle icon={<Briefcase size={14} className="text-emerald-400" />}>Job market</PanelTitle>
          <div className="p-4 space-y-2">
            <FilterBar count={filteredJobs.length}>
              <SearchInput className="w-40" value={jobSearch} onChange={setJobSearch} placeholder="company…" />
              <FilterSelect
                label="country"
                value={jobCountry}
                onChange={setJobCountry}
                options={[{ value: "all", label: "all" }, ...(map?.countries ?? []).map((c) => ({ value: c.id, label: c.code }))]}
              />
              <FilterSelect
                label="product"
                value={jobProduct}
                onChange={setJobProduct}
                options={[{ value: "all", label: "all" }, ...jobProducts.map((p) => ({ value: p, label: p.toLowerCase() }))]}
              />
              <FilterSelect
                label="salary"
                value={salarySort}
                onChange={setSalarySort}
                options={[{ value: "none", label: "—" }, { value: "desc", label: "high→low" }, { value: "asc", label: "low→high" }]}
              />
              <FilterToggle label="eco ok only" checked={eligibleOnly} onChange={setEligibleOnly} />
            </FilterBar>
            {filteredJobs.map((job) => {
              const isCurrent = (job as any).isCurrentJob;
              const isHiredToday = (job as any).hiredToday || (tasks as any)?.hiredToday;
              const skillLow = (me?.ecoSkill ?? 0) < job.minEcoSkill;
              const disabled = busy === job.id || isCurrent || isHiredToday || skillLow;
              const label = isCurrent
                ? "Current ✓"
                : isHiredToday
                ? "Hired Today"
                : skillLow
                ? "Skill Low"
                : "Apply";

              return (
                <div key={job.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-200">{job.company.name}</div>
                    <div className="text-slate-500">{job.company.product.toLowerCase()} Q{job.company.quality} · {job.company.region.name} · eco {job.minEcoSkill}+</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-bold ${(me?.ecoSkill ?? 0) < job.minEcoSkill ? "text-slate-600" : "text-emerald-400"}`}>{(job.salary / 100).toFixed(2)} CC</span>
                    <Button size="sm" variant="outline" onClick={() => apply(job.id, job.company.name)} disabled={disabled}>{label}</Button>
                  </div>
                </div>
              );
            })}
            {filteredJobs.length === 0 && (jobs ?? []).length > 0 && <p className="text-xs text-slate-500">No jobs match your filters.</p>}
            {(jobs ?? []).length === 0 && <p className="text-xs text-slate-500">No open positions — company owners post jobs from the Companies page.</p>}
          </div>
        </Panel>

        {/* CONSUMABLES */}
        <Panel>
          <PanelTitle icon={<Heart size={14} className="text-red-400" />}>Rations & energy drinks</PanelTitle>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {food.map((f) => (
                <Button key={f.quality} size="sm" variant="success" onClick={() => eat("FOOD", f.quality)} disabled={busy === `FOOD${f.quality}`}>
                  🍞 Q{f.quality} ×{f.quantity} (+{10 * f.quality} HP)
                </Button>
              ))}
              {food.length === 0 && <p className="text-xs text-slate-500">No rations — buy food on the market page.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {drinks.map((g) => (
                <Button key={g.quality} size="sm" variant="outline" onClick={() => eat("ENERGY_DRINK", g.quality)} disabled={busy === `ENERGY_DRINK${g.quality}`}>
                  🥤 Q{g.quality} ×{g.quantity}
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              Limits: 🍛 {tasks?.foodUsed}/{tasks?.foodLimit} · 🥤 {tasks?.energyUsed}/{tasks?.energyLimit} — each has its own daily cap; pick any quality you own. 30-day streaks pay Hard Worker / Super Soldier medals (5g).
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
