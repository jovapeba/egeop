"use client";

import { useState } from "react";
import { Siren, Network, Coins, FileClock, ScrollText, Search, ShieldAlert, HandCoins } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Input, Panel, PanelTitle, useToast } from "@/lib/ui";

interface Me {
  id: string;
  isAdmin: boolean;
}
interface IpAccount {
  id: string;
  nickname: string;
  lastIp: string | null;
  level: number;
  citizenshipCountry: { name: string; code: string };
}
interface SharedIp {
  ip: string;
  accounts: IpAccount[];
}
interface OpenDebt {
  id: string;
  type: string;
  creator: { id: string; nickname: string };
  counterparty: { id: string; nickname: string } | null;
  totalDueGold: number;
  status: string;
}
interface InactiveShare {
  shareId: string;
  jsc: string;
  holder: string;
  quantity: number;
  lastSeen: string;
}
interface AuditEntry {
  id: string;
  note: string;
  at: string;
}
interface Overview {
  staffRanks: string[];
  sharedIp: SharedIp[];
  openDebts: OpenDebt[];
  inactiveShares: InactiveShare[];
  recentTransactions: AuditEntry[];
  totals: { citizens: number; countries: number; completedContracts: number };
  liquidationDays: number;
}

export default function StaffPage() {
  const { push } = useToast();
  const { data: me } = useApi<Me>("/auth/me");
  const { data, error, reload } = useApi<Overview>(me?.isAdmin ? "/staff/overview" : null, [me?.isAdmin]);
  const [lookupId, setLookupId] = useState("");
  const [audit, setAudit] = useState<{ nickname: string; lastIp: string | null; createdAt: string } | null>(null);

  if (me && !me.isAdmin) {
    return (
      <div className="max-w-6xl mx-auto">
        <Panel className="p-10 text-center space-y-2">
          <ShieldAlert className="w-10 h-10 mx-auto text-red-400" />
          <h1 className="text-lg font-black text-slate-100">Restricted Deck</h1>
          <p className="text-sm text-slate-400">This command deck is available to eGeopolis staff only.</p>
        </Panel>
      </div>
    );
  }

  async function runAudit() {
    if (!lookupId.trim()) return;
    try {
      const res = await api<{ nickname: string; lastIp: string | null; createdAt: string }>(
        `/staff/citizens/${lookupId.trim()}/audit`,
      );
      setAudit(res);
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Panel className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-red-600 to-rose-500 rounded-xl shadow-lg shadow-red-500/20">
            <Siren className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100 tracking-wide">Staff Moderation Deck</h1>
            <p className="text-xs text-slate-400">
              Ranks: {(data?.staffRanks ?? []).join(" · ") || "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="cyan">{data?.totals.citizens ?? 0} citizens</Badge>
          <Badge color="emerald">{data?.totals.countries ?? 0} countries</Badge>
          <Badge color="gold">{data?.totals.completedContracts ?? 0} settled contracts</Badge>
        </div>
      </Panel>

      {error && <Panel className="p-4 text-xs text-red-300">{error}</Panel>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SHARED-IP AUDIT */}
        <Panel>
          <PanelTitle icon={<Network size={13} className="text-cyan-400" />}>Shared-IP audit (≥2 accounts)</PanelTitle>
          <div className="p-4 space-y-2">
            {(data?.sharedIp ?? []).map((row) => (
              <div key={row.ip} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-1">
                <p className="font-mono text-xs text-cyan-300">{row.ip}</p>
                <div className="flex flex-wrap gap-1.5">
                  {row.accounts.map((a) => (
                    <Badge key={a.id} color="purple">
                      {a.nickname} · {a.citizenshipCountry.code} · L{a.level}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {(data?.sharedIp ?? []).length === 0 && <p className="text-xs text-slate-500">No shared-IP clusters flagged.</p>}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <Input className="flex-1" value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="citizen id audit…" />
              <Button size="sm" variant="outline" onClick={runAudit}>
                <Search size={12} /> audit
              </Button>
            </div>
            {audit && (
              <p className="text-[11px] font-mono text-slate-400">
                {audit.nickname} — last IP {audit.lastIp ?? "unknown"} · joined {new Date(audit.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </Panel>

        {/* OPEN DEBTS */}
        <Panel>
          <PanelTitle icon={<Coins size={13} className="text-amber-400" />}>Open debts (loans)</PanelTitle>
          <div className="p-4 space-y-1.5">
            {(data?.openDebts ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-sm">
                <span className="truncate">
                  {d.creator.nickname} → {d.counterparty?.nickname ?? "open"}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-amber-300">{(Number(d.totalDueGold) / 100).toFixed(2)}g</span>
                  <Badge color={d.status === "OPEN" ? "slate" : "cyan"}>{d.status}</Badge>
                </span>
              </div>
            ))}
            {(data?.openDebts ?? []).length === 0 && <p className="text-xs text-slate-500">No open debts.</p>}
          </div>
        </Panel>

        {/* INACTIVE SHARES */}
        <Panel>
          <PanelTitle icon={<HandCoins size={13} className="text-purple-400" />}>
            Liquidatable shares (inactive {data?.liquidationDays ?? 30}d+)
          </PanelTitle>
          <div className="p-4 space-y-1.5">
            {(data?.inactiveShares ?? []).map((s) => (
              <div key={s.shareId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-sm">
                <span className="truncate">
                  {s.holder} <span className="text-slate-500">in</span> {s.jsc}
                </span>
                <span className="shrink-0 font-mono text-purple-300">×{s.quantity}</span>
              </div>
            ))}
            {(data?.inactiveShares ?? []).length === 0 && (
              <p className="text-xs text-slate-500">No inactive holders flagged for liquidation.</p>
            )}
          </div>
        </Panel>

        {/* AUDIT FEED */}
        <Panel>
          <PanelTitle icon={<ScrollText size={13} className="text-emerald-400" />}>Transaction audit feed</PanelTitle>
          <div className="p-4 space-y-1">
            {(data?.recentTransactions ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-sm">
                <FileClock size={12} className="shrink-0 text-slate-500" />
                <span className="flex-1 truncate">{a.note}</span>
                <span className="text-[10px] text-slate-600 shrink-0">{new Date(a.at).toLocaleDateString()}</span>
              </div>
            ))}
            {(data?.recentTransactions ?? []).length === 0 && <p className="text-xs text-slate-500">No audited transactions yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
