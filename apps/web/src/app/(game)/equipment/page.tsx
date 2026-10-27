"use client";

import { useMemo, useState } from "react";
import { Shield, Merge, Split, Tag, ArrowUpCircle, X } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Tabs, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";

const SLOT_LABELS: Record<string, string> = {
  MUZZLE: "Muzzle", LASER: "Laser", OPTIC: "Optic", STOCK: "Stock",
  REAR_GRIP: "Rear grip", MAGAZINE: "Magazine", BARREL: "Barrel", UNDERBARREL: "Underbarrel",
};
const PARAM_LABELS: Record<string, string> = {
  HEADSHOT: "Headshot +%", RECOIL: "Recoil −%", MAX_DAMAGE: "Max dmg +%", MIN_DAMAGE: "Min dmg +%",
  STRENGTH: "Strength +", PUNCH: "Punch +", LUCK: "Luck +%", RESUPPLY: "Resupply +%", GOOD_LOOKING: "Good looking +",
};

interface GearItem {
  id: string; slot: string; quality: number; name: string; ownerId: string;
  params: Array<{ type: string; value: number }>;
}
interface EquipData {
  items: GearItem[];
  equipped: Record<string, string>;
  aggregate: Record<string, number>;
}
interface Offer { id: string; price: number; item: GearItem; owner: { id: string; nickname: string } }

export default function EquipmentPage() {
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"gear" | "merge" | "market">("gear");
  const { data: eq, reload } = useApi<EquipData>("/equipment/mine");
  const { data: offers, reload: reloadOffers } = useApi<Offer[]>("/equipment/offers");
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);
  const [upgradeItem, setUpgradeItem] = useState<GearItem | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg(ok); reload(); reloadOffers(); refresh(); setSelected([]); } catch (e) { setMsg((e as Error).message); }
  }

  // Per-tab filters
  const [gearSlot, setGearSlot] = useState("all");
  const [gearQuality, setGearQuality] = useState("all");
  const [offerQuality, setOfferQuality] = useState("all");
  const [offerSort, setOfferSort] = useState("none");
  const [mergeQuality, setMergeQuality] = useState("all");

  const equippedIds = new Set(Object.values(eq?.equipped ?? {}));
  const storedItems = useMemo(
    () =>
      (eq?.items ?? []).filter((i) => i.ownerId && !equippedIds.has(i.id)),
    [eq],
  );
  const filteredGear = useMemo(
    () =>
      storedItems.filter(
        (i) => (gearSlot === "all" || i.slot === gearSlot) && (gearQuality === "all" || String(i.quality) === gearQuality),
      ),
    [storedItems, gearSlot, gearQuality],
  );
  const filteredOffers = useMemo(() => {
    let list = (offers ?? []).filter((o) => offerQuality === "all" || String(o.item.quality) === offerQuality);
    if (offerSort === "asc") list = [...list].sort((a, b) => a.price - b.price);
    if (offerSort === "desc") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [offers, offerQuality, offerSort]);
  const filteredMerge = useMemo(
    () => (eq?.items ?? []).filter((i) => mergeQuality === "all" || String(i.quality) === mergeQuality),
    [eq, mergeQuality],
  );
  const qualityOptions = [
    { value: "all", label: "all" },
    ...[1, 2, 3, 4, 5].map((q) => ({ value: String(q), label: `Q${q}` })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Shield size={14} />}>Weapon Attachments — 8 slots · Q1–Q5</CardTitle>
        <Tabs tabs={[{ id: "gear", label: "My gear" }, { id: "merge", label: "Merge & split" }, { id: "market", label: "Auctions" }]} value={tab} onChange={setTab} />
        {msg && <p className="mb-2 text-sm text-info">{msg}</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(SLOT_LABELS).map(([slot, label]) => {
            const itemId = eq?.equipped?.[slot];
            const item = eq?.items.find((i) => i.id === itemId);
            return (
              <div key={slot} className={`rounded-lg border p-2.5 ${item ? "border-amber-400/40 bg-amber-400/5" : "border-line bg-panel"}`}>
                <p className="text-xs font-bold uppercase text-muted">{label}</p>
                {item ? (
                  <>
                    <p className="mt-1 text-sm font-bold">{item.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.params.map((p) => (
                        <Badge key={p.type} color="emerald">{PARAM_LABELS[p.type] ?? p.type} +{p.value}</Badge>
                      ))}
                    </div>
                    <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => act(() => api(`/equipment/equipped/${item.id}/unequip`, { method: "DELETE" }), "Unequipped")}>
                      unequip
                    </Button>
                  </>
                ) : <p className="mt-1 text-xs text-muted">empty</p>}
              </div>
            );
          })}
        </div>

        {eq && (
          <p className="mt-3 text-xs text-muted">
            Set bonuses: headshot +{eq.aggregate.headshotPct}% · recoil −{eq.aggregate.recoilReduction}% · max dmg +{eq.aggregate.maxDamagePct}% ·
            min dmg +{eq.aggregate.minDamagePct}% · strength +{eq.aggregate.strengthBonus} · punch +{eq.aggregate.punch} · luck +{eq.aggregate.luckPct}% ·
            resupply +{eq.aggregate.resupplyPct}% · good looking +{eq.aggregate.goodLooking}
          </p>
        )}
      </Card>

      {tab === "gear" && (
        <Card>
          <CardTitle icon={<Tag size={14} />}>Storage — equip or list on auction</CardTitle>
          <FilterBar count={filteredGear.length}>
            <FilterSelect
              label="slot"
              value={gearSlot}
              onChange={setGearSlot}
              options={[{ value: "all", label: "all" }, ...Object.entries(SLOT_LABELS).map(([v, l]) => ({ value: v, label: l.toLowerCase() }))]}
            />
            <FilterSelect label="quality" value={gearQuality} onChange={setGearQuality} options={qualityOptions} />
          </FilterBar>
          <div className="space-y-1.5">
            {filteredGear.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                <p className="flex-1 text-sm font-bold">{item.name} <span className="text-muted">({SLOT_LABELS[item.slot]})</span></p>
                {item.params.map((p) => <Badge key={p.type} color="emerald">{PARAM_LABELS[p.type] ?? p.type} +{p.value}</Badge>)}
                <Button size="sm" onClick={() => act(() => api(`/equipment/${item.id}/equip`, { method: "POST" }), "Equipped")}>equip</Button>
                <Button size="sm" variant="ghost" className="text-cyan-400 hover:text-cyan-300" onClick={() => setUpgradeItem(item)}>
                  <ArrowUpCircle size={13} /> upgrade
                </Button>
                <Input className="w-20" value={price} onChange={(e) => setPrice(e.target.value)} />
                <Button size="sm" variant="outline" onClick={() => act(() => api("/equipment/offers", { method: "POST", body: { itemId: item.id, price: Number(price) } }), "Listed on auction")}>sell</Button>
                <Button size="sm" variant="ghost" onClick={() => act(() => api(`/equipment/${item.id}/split`, { method: "POST" }), "Split into 2 lower-Q items")}>
                  <Split size={13} /> split
                </Button>
              </div>
            ))}
            {filteredGear.length === 0 && storedItems.length > 0 && <p className="text-sm text-muted">No items match your filters.</p>}
            {(eq?.items ?? []).length === 0 && <p className="text-sm text-muted">No equipment yet — win drops in battles.</p>}
          </div>

          {upgradeItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{upgradeItem.name}</h3>
                    <p className="text-xs text-muted">Quality Q{upgradeItem.quality} · Upgrade Attachment Parameter</p>
                  </div>
                  <button onClick={() => setUpgradeItem(null)} className="text-muted hover:text-slate-200">
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Consuming 1 Upgrade special item increases the parameter by +10% of total quality range.
                </p>
                <div className="mt-4 space-y-2">
                  {upgradeItem.params.map((p) => (
                    <div key={p.type} className="flex items-center justify-between rounded-lg border border-line/60 bg-surface/50 p-2.5">
                      <div>
                        <p className="text-xs font-bold text-cyan-400">{PARAM_LABELS[p.type] ?? p.type}</p>
                        <p className="text-xs text-muted">Current: +{p.value}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const targetType = p.type;
                          act(
                            () => api(`/equipment/${upgradeItem.id}/upgrade-param`, { method: "POST", body: { paramType: targetType } }),
                            `Upgraded ${PARAM_LABELS[targetType] ?? targetType} +10%!`,
                          );
                          setUpgradeItem(null);
                        }}
                      >
                        <ArrowUpCircle size={13} /> Upgrade (+10%)
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === "merge" && (
        <Card>
          <CardTitle icon={<Merge size={14} />}>WA Dealer — merge 3×Q[x] + fee → 1×Q[x+1]</CardTitle>
          <p className="mb-2 text-xs text-muted">Fees: 3×Q1→Q2 0.67g · 3×Q2→Q3 2g · 3×Q3→Q4 6g · 3×Q4→Q5 18g. New stats are randomized.</p>
          <FilterBar count={filteredMerge.length}>
            <FilterSelect label="quality" value={mergeQuality} onChange={setMergeQuality} options={qualityOptions} />
          </FilterBar>
          <div className="space-y-1.5">
            {filteredMerge.map((item) => {
              const isSel = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected((s) => (isSel ? s.filter((x) => x !== item.id) : s.length < 3 ? [...s, item.id] : s))}
                  className={`flex w-full flex-wrap items-center gap-2 rounded-lg border p-2.5 text-left ${isSel ? "border-primary bg-primary/10" : "border-line bg-panel"}`}
                >
                  <span className="flex-1 text-sm font-bold">{item.name}</span>
                  <Badge color="cyan">Q{item.quality}</Badge>
                  {item.params.map((p) => <Badge key={p.type} color="emerald">+{p.value} {PARAM_LABELS[p.type]}</Badge>)}
                </button>
              );
            })}
          </div>
          <Button
            className="mt-3"
            disabled={selected.length !== 3}
            onClick={() => act(() => api("/equipment/merge", { method: "POST", body: { itemIds: selected } }), "Merged → Q(x+1) item created")}
          >
            <Merge size={14} /> Merge selected ({selected.length}/3)
          </Button>
        </Card>
      )}

      {tab === "market" && (
        <Card>
          <CardTitle icon={<Tag size={14} />}>Auction offers (2% seller fee)</CardTitle>
          <FilterBar count={filteredOffers.length}>
            <FilterSelect label="quality" value={offerQuality} onChange={setOfferQuality} options={qualityOptions} />
            <FilterSelect
              label="price"
              value={offerSort}
              onChange={setOfferSort}
              options={[{ value: "none", label: "—" }, { value: "asc", label: "low→high" }, { value: "desc", label: "high→low" }]}
            />
          </FilterBar>
          <div className="space-y-1.5">
            {filteredOffers.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                <p className="flex-1 text-sm font-bold">{o.item.name}</p>
                {o.item.params.map((p) => <Badge key={p.type} color="emerald">+{p.value} {PARAM_LABELS[p.type]}</Badge>)}
                <Badge color="gold">{(o.price / 100).toFixed(2)}g</Badge>
                <Button size="sm" onClick={() => act(() => api(`/equipment/offers/${o.id}/buy`, { method: "POST" }), "Purchased")}>buy</Button>
              </div>
            ))}
            {filteredOffers.length === 0 && (offers ?? []).length > 0 && <p className="text-sm text-muted">No offers match your filters.</p>}
            {(offers ?? []).length === 0 && <p className="text-sm text-muted">No active auctions.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
