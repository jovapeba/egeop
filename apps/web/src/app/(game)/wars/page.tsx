"use client";

import { useMemo, useState } from "react";
import { Plane, Swords, Ticket, X } from "lucide-react";
import { TICKET_TRAVEL_HP } from "@egeopolis/game-core";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Panel, PanelTitle, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";
import { WorldMap, type MapRegion } from "@/components/world-map";

interface MapPayload {
  regions: MapRegion[];
  countries: Array<{ id: string; name: string; code: string; flagColor: string }>;
  neighbors: Array<{ aId: string; bId: string }>;
}

interface War {
  id: string;
  type: string;
  attackerCountry: { name: string } | null;
  defenderCountry: { name: string };
  attackerWins: number;
  defenderWins: number;
  battles: Array<{ id: string }>;
}

interface StorageEntry { product: string; quality: number; quantity: number }

/** Wiki ticket classes: Q1 Economy (−50 HP) … Q5 First Class (0 HP). */
const TICKET_CLASSES = [
  { q: 1, label: "Economy" },
  { q: 2, label: "Plus" },
  { q: 3, label: "Business" },
  { q: 4, label: "Premium" },
  { q: 5, label: "First Class" },
];

export default function WarsPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const { data: world, reload } = useApi<MapPayload>("/citizens/map");
  const { data: wars, reload: reloadWars } = useApi<War[]>("/wars");
  const { data: me, reload: reloadMe } = useApi<{ id: string; citizenshipCountryId: string; level: number; hp: number; locationRegionId: string }>("/auth/me");

  // Travel (wiki: spend 1 TICKET of chosen quality; quality sets the HP cost)
  const [travelTarget, setTravelTarget] = useState<MapRegion | null>(null);
  const [ticketQ, setTicketQ] = useState(5);
  const [travelBusy, setTravelBusy] = useState(false);
  const { data: travelStorage } = useApi<StorageEntry[]>(
    travelTarget ? "/citizens/me/storage" : null,
    [travelTarget],
  );
  const ticketCount = (q: number) =>
    (travelStorage ?? []).filter((s) => s.product === "TICKET" && s.quality === q).reduce((a, s) => a + s.quantity, 0);

  async function doTravel() {
    if (!travelTarget || travelBusy) return;
    setTravelBusy(true);
    try {
      const res = await api<{ region: string; ticketUsed: boolean; hpLost: number }>("/citizens/me/travel", {
        method: "POST",
        body: { regionId: travelTarget.id, ticketQuality: ticketQ },
      });
      push(
        `Arrived in ${res.region} — ${res.ticketUsed ? `1 ticket used${res.hpLost ? `, −${res.hpLost} HP` : ""}` : "free flight (resupply perk)!"}`,
        "success",
      );
      setTravelTarget(null);
      reloadMe();
      reload();
      refresh();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setTravelBusy(false);
    }
  }

  async function startRw(regionId: string) {
    try {
      await api("/wars/resistance", { method: "POST", body: { regionId } });
      push("Resistance war started (20g) — fight for rightful sovereignty!", "success");
      reload();
      reloadWars();
      refresh();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  // Active-war filters
  const [warType, setWarType] = useState("all");
  const filteredWars = useMemo(
    () => (wars ?? []).filter((w) => warType === "all" || w.type === warType),
    [wars, warType],
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Real World SVG Map */}
      <WorldMap
        regions={world?.regions}
        countries={world?.countries}
        onStartRw={startRw}
        onTravel={setTravelTarget}
        meLocationRegionId={me?.locationRegionId}
        meCountryId={me?.citizenshipCountryId}
        userLevel={me?.level}
      />

      {/* Active Wars Section */}
      <Panel>
        <PanelTitle icon={<Swords size={14} className="text-red-400" />}>
          Active Wars & Campaigns
        </PanelTitle>
        <div className="p-4 space-y-2.5">
          <FilterBar count={filteredWars.length}>
            <FilterSelect
              label="type"
              value={warType}
              onChange={setWarType}
              options={[
                { value: "all", label: "all" },
                { value: "DIRECT", label: "direct" },
                { value: "RESISTANCE", label: "resistance" },
                { value: "CIVIL", label: "civil" },
              ]}
            />
          </FilterBar>
          {filteredWars.map((w) => (
            <div
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3 hover:border-slate-700 transition"
            >
              <div className="flex items-center gap-2">
                <Badge color={w.type === "RESISTANCE" ? "gold" : w.type === "CIVIL" ? "purple" : "red"}>
                  {w.type}
                </Badge>
                <span className="text-sm">
                  <strong className="text-slate-100">{w.attackerCountry?.name ?? "Rebels"}</strong>{" "}
                  <span className="text-slate-500 font-normal">vs</span>{" "}
                  <strong className="text-slate-100">{w.defenderCountry.name}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Badge color="emerald">
                  Score {w.attackerWins} : {w.defenderWins}
                </Badge>
                {w.battles.map((b: { id: string }) => (
                  <a
                    key={b.id}
                    href={`/fight?battle=${b.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 underline"
                  >
                    <Swords className="h-3 w-3" /> Join Battle →
                  </a>
                ))}
              </div>
            </div>
          ))}

          {filteredWars.length === 0 && (wars ?? []).length > 0 && (
            <p className="text-xs text-slate-500">No wars match your filters.</p>
          )}
          {(wars ?? []).length === 0 && (
            <p className="text-xs text-slate-500">
              No active wars worldwide. Presidents declare official wars from their national treasury;
              citizens start resistance wars on occupied territories (20g, L10); civil wars require a 33% approval poll.
            </p>
          )}
        </div>
      </Panel>

      {/* TRAVEL MODAL — pick a ticket class (HP cost per wiki TICKET_TRAVEL_HP) */}
      {travelTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setTravelTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-slate-100">
                  <Plane size={16} className="text-cyan-300" /> Travel to {travelTarget.name}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {travelTarget.country.name} · your HP:{" "}
                  <strong className="text-slate-100">{Math.round(me?.hp ?? 0)}</strong>
                </p>
              </div>
              <button onClick={() => setTravelTarget(null)} className="text-slate-500 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <p className="mt-3 text-[11px] text-slate-400">
              Pick a ticket class — better classes cost less health. Buy 🎫 tickets on the{" "}
              <a href="/market" className="text-cyan-300 underline">Market</a>.
            </p>

            <div className="mt-3 space-y-1.5">
              {TICKET_CLASSES.map(({ q, label }) => {
                const cost = TICKET_TRAVEL_HP[q];
                const owned = ticketCount(q);
                const tooCostly = (me?.hp ?? 0) < cost;
                return (
                  <button
                    key={q}
                    onClick={() => setTicketQ(q)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                      ticketQ === q
                        ? "border-cyan-500/60 bg-cyan-950/20"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-bold text-slate-100">
                      <Ticket size={13} className={ticketQ === q ? "text-cyan-300" : "text-slate-500"} />
                      Q{q} {label}
                    </span>
                    <span className={`font-mono font-bold ${cost === 0 ? "text-emerald-400" : tooCostly ? "text-rose-400" : "text-slate-400"}`}>
                      −{cost} HP
                    </span>
                    <span className={`font-mono ${owned > 0 ? "text-slate-300" : "text-rose-400"}`}>
                      ×{owned} owned
                    </span>
                  </button>
                );
              })}
            </div>

            <Button className="mt-4 w-full" disabled={travelBusy} onClick={doTravel}>
              <Plane size={14} /> Fly to {travelTarget.name}
            </Button>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Military resupply perks occasionally grant free flights (no ticket spent).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
