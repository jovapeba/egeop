"use client";

import { useMemo, useState } from "react";
import { Building2, Factory, PlusCircle, ArrowUpCircle, Briefcase, PackageOpen } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Select, Tabs, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect, SearchInput, matches } from "@/lib/filters";
import { StocksPanel } from "./stocks-panel";

const MFG = ["AMMO", "FOOD", "ENERGY_DRINK", "TICKET", "PANTRY", "FRIDGE", "HOSPITAL", "FORTIFICATION", "MILITARY_AIR_BASE", "MILITARY_NAVY_BASE"] as const;
const RAW = ["GRAIN", "SUGAR", "GUNPOWDER", "STONE", "WOOD", "PETROL"] as const;

interface Company {
  id: string; name: string; product: string; quality: number;
  region: { id: string; name: string; resource: string | null; density: string }; fiatWallet: number; forSale: boolean; salePrice: number;
}
interface Region { id: string; name: string; resource: string | null; density: string; countryId: string }
interface Country { id: string; name: string; code: string }
interface StorageEntry { product: string; quality: number; quantity: number }

export default function CompaniesPage() {
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"mine" | "create" | "market" | "chain" | "stocks">("mine");
  const { data: mine, reload } = useApi<Company[]>("/companies/mine");
  const { data: map } = useApi<{ regions: Region[]; countries: Country[] }>(`/citizens/map`);
  const { data: market } = useApi<Company[]>("/companies/market");
  const { data: me } = useApi<{ locationRegion: { id: string } }>("/auth/me");
  const { data: storage, reload: reloadStorage } = useApi<StorageEntry[]>(`/citizens/me/storage`);
  const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [product, setProduct] = useState<string>("FOOD");
  const [regionId, setRegionId] = useState("");
  const [minEco, setMinEco] = useState("1");
  const [salary, setSalary] = useState("25");
  const [price, setPrice] = useState("15");

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg(ok); reload(); reloadStorage(); refresh(); } catch (e) { setMsg((e as Error).message); }
  }

  const myRegions = (map?.regions ?? []).filter((r) => r.countryId === (map?.countries[0]?.id ?? ""));

  // "For sale" market filters
  const [saleSearch, setSaleSearch] = useState("");
  const [saleProduct, setSaleProduct] = useState("all");
  const [saleSort, setSaleSort] = useState("none");
  const saleProducts = useMemo(() => [...new Set((market ?? []).map((c) => c.product))].sort(), [market]);
  const filteredMarket = useMemo(() => {
    let list = (market ?? []).filter((c) => matches(c.name, saleSearch) && (saleProduct === "all" || c.product === saleProduct));
    if (saleSort === "asc") list = [...list].sort((a, b) => a.salePrice - b.salePrice);
    if (saleSort === "desc") list = [...list].sort((a, b) => b.salePrice - a.salePrice);
    return list;
  }, [market, saleSearch, saleProduct, saleSort]);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Building2 size={14} />}>Companies</CardTitle>
        <Tabs
          tabs={[{ id: "mine", label: "Mine" }, { id: "create", label: "Create (20g)" }, { id: "market", label: "For sale" }, { id: "stocks", label: "Stocks (JSC)" }, { id: "chain", label: "Production chain" }]}
          value={tab}
          onChange={setTab}
        />
        {msg && <p className="mb-2 text-sm text-info">{msg}</p>}

        {tab === "mine" && (
          <div className="space-y-2">
            {(mine ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 font-bold">{c.name}</p>
                  <Badge color="cyan">{c.product.toLowerCase()} Q{c.quality}</Badge>
                  <Badge color="slate">{c.region.name}</Badge>
                  <Badge color="gold">wallet {(c.fiatWallet / 100).toLocaleString()}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setSel(sel === c.id ? null : c.id)}>manage</Button>
                  <Button size="sm" onClick={() => act(() => api(`/companies/${c.id}/upgrade`, { method: "POST" }), "Upgraded")}>
                    <ArrowUpCircle size={13} /> upgrade
                  </Button>
                </div>
                {sel === c.id && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div><p className="mb-1 text-xs text-muted">Job: min eco</p><Input className="w-20" value={minEco} onChange={(e) => setMinEco(e.target.value)} /></div>
                      <div><p className="mb-1 text-xs text-muted">Salary/day</p><Input className="w-20" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
                      <Button size="sm" onClick={() => act(() => api(`/companies/${c.id}/jobs`, { method: "POST", body: { minEcoSkill: Number(minEco), salary: Number(salary) } }), "Job posted")}>post job</Button>
                      <div><p className="mb-1 text-xs text-muted">Sale price (gold)</p><Input className="w-20" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                      <Button size="sm" onClick={() => act(() => api(`/companies/${c.id}/sale`, { method: "POST", body: { price: Number(price) } }), "Listed for sale")}>sell</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(storage ?? []).map((s) => (
                        <Button key={s.product + s.quality} size="sm" variant="outline" onClick={() => act(() => api(`/companies/${c.id}/deposit`, { method: "POST", body: { product: s.product, quality: s.quality, qty: Math.min(50, s.quantity) } }), "Deposited")}>
                          deposit {s.product.toLowerCase()}{s.quality ? ` Q${s.quality}` : ""} ×{s.quantity}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(mine ?? []).length === 0 && <p className="text-sm text-muted">You don't own a company yet — create one for 20 gold.</p>}
          </div>
        )}

        {tab === "create" && (
          <div className="flex flex-wrap items-end gap-2">
            <div><p className="mb-1 text-xs text-muted">Name</p><Input className="w-52" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Factory" /></div>
            <div>
              <p className="mb-1 text-xs text-muted">Product</p>
              <Select className="w-36" value={product} onChange={(e) => setProduct(e.target.value)}>
                <optgroup label="Raw (needs region resource)">{RAW.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}</optgroup>
                <optgroup label="Manufactured">{MFG.map((m) => <option key={m} value={m}>{m.toLowerCase()}</option>)}</optgroup>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Region</p>
              <Select className="w-52" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value={me?.locationRegion?.id ?? ""}>📍 my region</option>
                {(map?.regions ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.resource ? ` (${r.density.toLowerCase()} ${r.resource.toLowerCase()})` : ""}</option>
                ))}
              </Select>
            </div>
            <Button onClick={() => act(() => api("/companies", { method: "POST", body: { name, product, regionId: regionId || me?.locationRegion?.id } }), "Company created for 20g")}>
              <PlusCircle size={14} /> Create — 20g
            </Button>
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-1.5">
            <FilterBar count={filteredMarket.length}>
              <SearchInput className="w-40" value={saleSearch} onChange={setSaleSearch} placeholder="company…" />
              <FilterSelect
                label="product"
                value={saleProduct}
                onChange={setSaleProduct}
                options={[{ value: "all", label: "all" }, ...saleProducts.map((p) => ({ value: p, label: p.toLowerCase() }))]}
              />
              <FilterSelect
                label="price"
                value={saleSort}
                onChange={setSaleSort}
                options={[{ value: "none", label: "—" }, { value: "asc", label: "low→high" }, { value: "desc", label: "high→low" }]}
              />
            </FilterBar>
            {filteredMarket.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                <p className="flex-1 text-sm font-bold">{c.name}</p>
                <Badge color="cyan">{c.product.toLowerCase()} Q{c.quality}</Badge>
                <Badge color="gold">{(c.salePrice / 100).toLocaleString()}g</Badge>
                <Button size="sm" onClick={() => act(() => api(`/companies/${c.id}/buy`, { method: "POST" }), "Company purchased!")}>buy</Button>
              </div>
            ))}
            {filteredMarket.length === 0 && (market ?? []).length > 0 && <p className="text-sm text-muted">No companies match your filters.</p>}
            {(market ?? []).length === 0 && <p className="text-sm text-muted">No companies for sale.</p>}
          </div>
        )}

        {tab === "stocks" && <StocksPanel />}

        {tab === "chain" && (
          <div className="space-y-2 text-sm">
            <p className="text-muted">Strict 2-tier dependency: <b className="text-slate-200">raw → factory → goods</b>.</p>
            {[
              ["Grain", "Food"], ["Iron", "Weapons"], ["Diamonds", "Gifts"], ["Oil", "Tickets"], ["Wood", "Houses + Hospitals"], ["Stone", "Estates, DS, Hospitals"],
            ].map(([raw, made]) => (
              <div key={raw} className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2">
                <span className="font-semibold text-amber-300">{raw}</span> <span className="text-muted">→</span> <span>{made}</span>
              </div>
            ))}
            <p className="text-xs text-muted">Regional bonus: HIGH +100% · MEDIUM +50% · LOW +25% output. Qx factory consumes x raw per unit.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
