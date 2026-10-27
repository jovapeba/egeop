"use client";

import { useMemo, useState } from "react";
import { Vote, Users, Gavel, Landmark, ThumbsUp, ThumbsDown, Clock, Globe } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Input, Panel, PanelTitle, Select, Tabs, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect, SearchInput, matches } from "@/lib/filters";

interface Party { id: string; name: string; _count?: { members: number }; leader?: { nickname: string } }
interface Candidacy { id: string; citizen: { nickname: string }; party?: { name: string } | null; presentation?: string | null }
interface Election { id: string; type: string; day: number; status: string; candidacies: Candidacy[] }
interface Law { id: string; type: string; status: string; yes: number; no: number; votingEndsAt: string; payload: Record<string, unknown> }
interface AllianceMember { country: { id: string; name: string; code: string; flagColor: string } }
interface Alliance { id: string; name: string; members: AllianceMember[] }

export default function PoliticsPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"elections" | "parties" | "laws" | "alliances">("elections");
  const { data: me } = useApi<{ id: string; citizenshipCountryId: string; level: number }>("/auth/me");
  const countryId = me?.citizenshipCountryId ?? "";

  const { data: parties, reload: reloadParties } = useApi<Party[]>(countryId ? `/politics/parties?countryId=${countryId}` : null);
  const { data: el, reload: reloadEl } = useApi<{ elections: Election[]; cycleDay: number; day: number }>(countryId ? `/politics/elections?countryId=${countryId}` : null, [countryId]);
  const { data: laws, reload: reloadLaws } = useApi<Law[]>(countryId ? `/politics/laws?countryId=${countryId}` : null, [countryId]);
  const { data: treasury } = useApi<{ treasuryGold: number; treasuryFiat: number; minWage: number; presidentId: string | null }>(countryId ? `/politics/treasury?countryId=${countryId}` : null, [countryId]);
  const { data: taxes } = useApi<Array<{ product: string; vat: number; importTax: number; incomeTax: number }>>(countryId ? `/markets/taxes?countryId=${countryId}` : null, [countryId]);
  const { data: alliances } = useApi<Alliance[]>(countryId ? "/politics/alliances" : null, [countryId]);
  const [newParty, setNewParty] = useState("");
  const [newAlliance, setNewAlliance] = useState("");
  const [joinAllianceId, setJoinAllianceId] = useState("");

  async function act(fn: () => Promise<unknown>, ok: string, type: "info" | "success" | "warning" = "success") {
    try { await fn(); push(ok, type); reloadParties(); reloadEl(); reloadLaws(); refresh(); } catch (e) { push((e as Error).message, "error"); }
  }

  const current = el?.elections?.[0];
  const presidentMe = treasury?.presidentId === me?.id;
  const [broadcastText, setBroadcastText] = useState("");

  // Parties / laws filters
  const [partySearch, setPartySearch] = useState("");
  const [lawStatus, setLawStatus] = useState("all");
  const [lawType, setLawType] = useState("all");
  const lawTypes = useMemo(() => [...new Set((laws ?? []).map((l) => l.type))].sort(), [laws]);
  const filteredParties = useMemo(() => (parties ?? []).filter((p) => matches(p.name, partySearch)), [parties, partySearch]);
  const filteredLaws = useMemo(
    () => (laws ?? []).filter((l) => (lawStatus === "all" || l.status === lawStatus) && (lawType === "all" || l.type === lawType)),
    [laws, lawStatus, lawType],
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Panel className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-bold text-slate-500 uppercase">Cycle day</div>
          <div className="text-base font-bold text-slate-100 mt-1">{el?.cycleDay ?? "?"} / 30</div>
          <div className="text-xs text-emerald-400">President d5 · Party d15 · Congress d25</div>
        </div>
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-bold text-slate-500 uppercase">Treasury</div>
          <div className="text-base font-bold text-amber-300 mt-1">{((treasury?.treasuryGold ?? 0) / 100).toFixed(2)}g</div>
          <div className="text-xs text-emerald-400">min wage {((treasury?.minWage ?? 0) / 100).toFixed(2)}</div>
        </div>
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
          <div className="text-xs font-bold text-slate-500 uppercase">Your power</div>
          <div className="text-base font-bold text-slate-100 mt-1">{presidentMe ? "👑 President" : "Citizen"}</div>
          <div className="text-xs text-cyan-400">income tax {taxes?.[0]?.incomeTax ?? 25}%</div>
        </div>
      </Panel>

      {presidentMe && (
        <Panel className="p-5 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-950 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase text-amber-400">👑 Presidential Dispatch</span>
            <span className="text-xs text-muted">Broadcast a 24-hour pop-up alert to all country citizens</span>
          </div>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="Enter executive dispatch message..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
            />
            <Button
              onClick={() =>
                act(
                  () => api("/politics/broadcast", { method: "POST", body: { message: broadcastText } }),
                  "Presidential dispatch broadcasted for 24h!",
                )
              }
            >
              Broadcast
            </Button>
          </div>
        </Panel>
      )}

      <Panel className="p-5 space-y-4">
        <Tabs tabs={[{ id: "elections", label: "Elections" }, { id: "parties", label: "Parties" }, { id: "laws", label: "Laws & Proposals" }, { id: "alliances", label: "Alliances" }]} value={tab} onChange={setTab} />

        {tab === "elections" && (
          <div className="space-y-3">
            {current ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color="cyan">{current.type.replace("_", " ")}</Badge>
                  <Badge color={current.status === "VOTING" ? "emerald" : "slate"}>{current.status}</Badge>
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={11} /> election day {current.day}</span>
                </div>
                <div className="space-y-1.5">
                  {current.candidacies.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900/80 p-2.5">
                      <span className="flex-1 text-sm font-bold">{c.citizen.nickname}{c.party ? ` · ${c.party.name}` : ""}</span>
                      <Button size="sm" onClick={() => act(() => api(`/politics/elections/${current.id}/vote`, { method: "POST", body: { candidateId: c.id } }), "Vote cast!")}>
                        <Vote size={12} /> vote
                      </Button>
                    </div>
                  ))}
                  {current.candidacies.length === 0 && <p className="text-xs text-slate-500">No candidacies yet.</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => act(() => api(`/politics/elections/${current.id}/candidacy`, { method: "POST", body: { presentation: "Vote for me!" } }), "Candidacy submitted!")}>
                  run for office
                </Button>
              </div>
            ) : <p className="text-xs text-slate-500">No election window open (candidature: d2–4 / d12–14 / d21–23).</p>}
          </div>
        )}

        {tab === "parties" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="mb-1 text-[10px] text-slate-500 uppercase">Found a party (L6)</p>
                <Input className="w-56" value={newParty} onChange={(e) => setNewParty(e.target.value)} placeholder="Party name" />
              </div>
              <Button onClick={() => act(() => api("/politics/parties", { method: "POST", body: { name: newParty } }), "Party founded!")}>create</Button>
              <Select className="w-60" value="" onChange={(e) => e.target.value && act(() => api(`/politics/parties/${e.target.value}/join`, { method: "POST" }), "Joined party!")}>
                <option value="">join a party…</option>
                {(parties ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p._count?.members ?? 0})</option>)}
              </Select>
              <Button variant="outline" onClick={() => act(() => api("/politics/parties/leave", { method: "POST" }), "Left party.", "info")}>leave party</Button>
            </div>
            <FilterBar count={filteredParties.length}>
              <SearchInput className="w-44" value={partySearch} onChange={setPartySearch} placeholder="party or leader…" />
            </FilterBar>
            <div className="space-y-1.5">
              {filteredParties.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-panel px-3 py-2 text-sm">
                  <Users size={13} className="text-slate-500" />
                  <span className="flex-1 font-bold">{p.name}</span>
                  <Badge color="slate">{p._count?.members ?? 0} members</Badge>
                  {p.leader && <Badge color="gold">👑 {p.leader.nickname}</Badge>}
                </div>
              ))}
              {filteredParties.length === 0 && (parties ?? []).length > 0 && <p className="text-xs text-slate-500">No parties match your search.</p>}
            </div>
          </div>
        )}

        {tab === "laws" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { t: "CHANGE_TAX", p: { product: "FOOD", vat: 5, importTax: 5 }, label: "Tax FOOD 5%" },
                { t: "SET_MIN_WAGE", p: { amount: 30 }, label: "Min wage 30" },
                { t: "PRINT_MONEY", p: { goldInt: 50 }, label: "Print 50g→CC" },
                { t: "DEPLOY_BUILDING", p: { regionId: "", buildingType: "HOSPITAL", quality: 1 }, label: "Deploy hospital" },
              ].map((b) => (
                <Button key={b.t} size="sm" variant="outline" onClick={() => act(() => api("/politics/laws", { method: "POST", body: { type: b.t, payload: b.p } }), "Law proposed!", "info")}>
                  <Gavel size={12} /> {b.label}
                </Button>
              ))}
            </div>
            <FilterBar count={filteredLaws.length}>
              <FilterSelect
                label="status"
                value={lawStatus}
                onChange={setLawStatus}
                options={[
                  { value: "all", label: "all" },
                  { value: "VOTING", label: "voting" },
                  { value: "EXECUTED", label: "executed" },
                  { value: "REJECTED", label: "rejected" },
                ]}
              />
              <FilterSelect
                label="type"
                value={lawType}
                onChange={setLawType}
                options={[{ value: "all", label: "all" }, ...lawTypes.map((t) => ({ value: t, label: t.toLowerCase() }))]}
              />
            </FilterBar>
            <div className="space-y-1.5">
              {filteredLaws.map((l) => (
                <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color="cyan">{l.type}</Badge>
                    <Badge color={l.status === "VOTING" ? "gold" : l.status === "EXECUTED" ? "emerald" : "slate"}>{l.status}</Badge>
                    <span className="text-xs text-slate-500">✓ {l.yes} · ✗ {l.no}</span>
                    {l.status === "VOTING" && (
                      <span className="ml-auto flex gap-1.5">
                        <Button size="sm" variant="success" onClick={() => act(() => api(`/politics/laws/${l.id}/vote`, { method: "POST", body: { yes: true } }), "Voted YES!")}>
                          <ThumbsUp size={12} /> yes
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => act(() => api(`/politics/laws/${l.id}/vote`, { method: "POST", body: { yes: false } }), "Voted NO.", "warning")}>
                          <ThumbsDown size={12} /> no
                        </Button>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">{JSON.stringify(l.payload)}</p>
                </div>
              ))}
              {filteredLaws.length === 0 && (laws ?? []).length > 0 && <p className="text-xs text-slate-500">No laws match your filters.</p>}
              {(laws ?? []).length === 0 && <p className="text-xs text-slate-500">No laws yet.</p>}
            </div>
          </div>
        )}

        {tab === "alliances" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Alliances are formed and managed by congress law — max 5 member countries each.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="mb-1 text-[10px] text-slate-500 uppercase">Found an alliance</p>
                <Input className="w-56" value={newAlliance} onChange={(e) => setNewAlliance(e.target.value)} placeholder="Alliance name" />
              </div>
              <Button onClick={() => act(() => api("/politics/laws", { method: "POST", body: { type: "CREATE_ALLIANCE", payload: { name: newAlliance } } }), "Alliance-creation law proposed!")}>
                <Gavel size={12} /> propose founding
              </Button>
              <Select className="w-56" value={joinAllianceId} onChange={(e) => setJoinAllianceId(e.target.value)}>
                <option value="">select an alliance…</option>
                {(alliances ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.members.length}/5)</option>
                ))}
              </Select>
              <Button variant="outline" disabled={!joinAllianceId} onClick={() => act(() => api("/politics/laws", { method: "POST", body: { type: "JOIN_ALLIANCE", payload: { allianceId: joinAllianceId } } }), "Join-alliance law proposed!")}>
                propose join
              </Button>
              <Button variant="ghost" disabled={!joinAllianceId} onClick={() => act(() => api("/politics/laws", { method: "POST", body: { type: "LEAVE_ALLIANCE", payload: { allianceId: joinAllianceId } } }), "Leave-alliance law proposed!")}>
                propose leave
              </Button>
            </div>
            <div className="space-y-1.5">
              {(alliances ?? []).map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe size={13} className="text-cyan-400" />
                    <span className="flex-1 text-sm font-bold">{a.name}</span>
                    <Badge color="cyan">{a.members.length}/5 members</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.members.map((m) => (
                      <span
                        key={m.country.id}
                        className="px-2 py-0.5 rounded-md border border-slate-800 bg-slate-900 text-[10px] font-bold"
                        style={{ color: m.country.flagColor }}
                      >
                        {m.country.flagColor} {m.country.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {(alliances ?? []).length === 0 && <p className="text-xs text-slate-500">No alliances founded yet.</p>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
