"use client";

import { useMemo, useState } from "react";
import { Trophy, Ticket as TicketIcon, Swords, PlusCircle } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Select, Tabs, useToast } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";

interface Team {
  id: string;
  name: string;
  countryId: string | null;
  points: number;
}
interface Match {
  id: string;
  round: number;
  teamAId: string;
  teamBId: string;
  hitsA: number;
  hitsB: number;
  winnerTeamId: string | null;
}
interface Tournament {
  id: string;
  type: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  teams: Team[];
  matches: Match[];
}
interface Me {
  id: string;
  isAdmin: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  GUNPOWDER_CUP: "Gunpowder Cup",
  GLOBAL_WAR: "Global War",
  ARMY_CUP: "Army Cup",
  COUNTRY_CUP: "Country Cup",
  QUICKDROP_CUP: "Quickdrop Cup",
  ONE_VS_ONE: "1v1 Tournament",
  FIRST_AID: "First Aid Tournament",
};

export default function EventsPage() {
  const { push } = useToast();
  const [tab, setTab] = useState<"tournaments" | "create">("tournaments");

  const { data: tournaments, reload } = useApi<Tournament[]>("/events");
  const { data: me } = useApi<Me>("/auth/me");

  const [type, setType] = useState("COUNTRY_CUP");
  const [startsIn, setStartsIn] = useState("30");
  const [teamName, setTeamName] = useState<Record<string, string>>({});

  async function createTournament() {
    try {
      await api("/events", { method: "POST", body: { type, startsInMinutes: Number(startsIn) } });
      push(`${TYPE_LABELS[type]} created — registration open.`, "success");
      reload();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function register(t: Tournament) {
    try {
      await api(`/events/${t.id}/register`, { method: "POST", body: { name: teamName[t.id] || undefined } });
      push(`Registered for ${TYPE_LABELS[t.type] ?? t.type}!`, "success");
      reload();
    } catch (e) { push((e as Error).message, "error"); }
  }

  const teamNameOf = (t: Tournament, id: string) => t.teams.find((x) => x.id === id)?.name ?? "—";

  // Tournament filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredTournaments = useMemo(
    () =>
      (tournaments ?? []).filter(
        (t) => (typeFilter === "all" || t.type === typeFilter) && (statusFilter === "all" || t.status === statusFilter),
      ),
    [tournaments, typeFilter, statusFilter],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Trophy size={14} />}>Tournaments & Special Events</CardTitle>
        <Tabs tabs={[{ id: "tournaments", label: "Tournaments" }, { id: "create", label: "Admin: create" }]} value={tab} onChange={setTab} />

        {tab === "tournaments" && (
          <div className="space-y-3">
            <FilterBar count={filteredTournaments.length}>
              <FilterSelect
                label="type"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[{ value: "all", label: "all" }, ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
              />
              <FilterSelect
                label="status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "all" },
                  { value: "REGISTERING", label: "registering" },
                  { value: "RUNNING", label: "running" },
                ]}
              />
            </FilterBar>
            {filteredTournaments.map((t) => (
              <div key={t.id} className="rounded-lg border border-line bg-panel p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-bold">{TYPE_LABELS[t.type] ?? t.type}</p>
                  <Badge color={t.status === "REGISTERING" ? "cyan" : t.status === "RUNNING" ? "emerald" : "slate"}>{t.status}</Badge>
                  {t.startsAt && <span className="text-xs text-muted">starts {new Date(t.startsAt).toLocaleTimeString()}</span>}
                  {t.status === "REGISTERING" && (
                    <div className="flex items-center gap-1.5">
                      <Input className="w-32" placeholder="team name (optional)" value={teamName[t.id] ?? ""} onChange={(e) => setTeamName((s: Record<string, string>) => ({ ...s, [t.id]: e.target.value }))} />
                      <Button size="sm" onClick={() => register(t)}>
                        <TicketIcon size={13} /> register
                      </Button>
                    </div>
                  )}
                </div>
                {t.teams.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.teams.map((team) => (
                      <Badge key={team.id} color="emerald">{team.name} · {team.points}p</Badge>
                    ))}
                  </div>
                )}
                {t.matches.length > 0 && (
                  <div className="space-y-1">
                    {t.matches.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-muted">
                        <Swords size={11} className="shrink-0" />
                        <span className="flex-1">
                          R{m.round}: {teamNameOf(t, m.teamAId)} {m.hitsA} — {m.hitsB} {teamNameOf(t, m.teamBId)}
                          {m.winnerTeamId && ` → winner ${teamNameOf(t, m.winnerTeamId)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredTournaments.length === 0 && (tournaments ?? []).length > 0 && <p className="text-sm text-muted">No tournaments match your filters.</p>}
            {(tournaments ?? []).length === 0 && (
              <p className="text-sm text-muted">No tournaments yet — 7 regular types: Gunpowder Cup, Global War, Army Cup, Country Cup, Quickdrop Cup, 1v1, First Aid.</p>
            )}
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-2">
            {!me?.isAdmin && <p className="text-xs text-muted">Admins only.</p>}
            <div className="flex flex-wrap gap-2">
              <Select className="w-52" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Input className="w-28" value={startsIn} onChange={(e) => setStartsIn(e.target.value)} placeholder="starts in (min)" />
              <Button onClick={createTournament} disabled={!me?.isAdmin}>
                <PlusCircle size={14} /> create tournament
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
