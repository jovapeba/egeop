"use client";

import { useMemo, useState } from "react";
import { Package, ShoppingCart, PackagePlus, XCircle, Coins } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Input, Panel, PanelTitle, Select, Tabs, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterNumber, FilterSelect } from "@/lib/filters";

const RAW_PRODUCTS = ["GRAIN", "SUGAR", "GUNPOWDER", "STONE", "WOOD", "PETROL"] as const;
const MFG_PRODUCTS = [
  "AMMO", "FOOD", "ENERGY_DRINK", "TICKET", "PANTRY", "FRIDGE",
  "HOSPITAL", "FORTIFICATION", "MILITARY_AIR_BASE", "MILITARY_NAVY_BASE",
] as const;
const PRODUCTS = [...RAW_PRODUCTS, ...MFG_PRODUCTS] as const;
const ICONS: Record<string, string> = {
  GRAIN: "🌾", SUGAR: "🍬", GUNPOWDER: "🧨", STONE: "🪨", WOOD: "🪵", PETROL: "🛢️",
  AMMO: "🔫", FOOD: "🍞", ENERGY_DRINK: "🥤", TICKET: "🎫", PANTRY: "🧺", FRIDGE: "🧊",
  HOSPITAL: "🏥", FORTIFICATION: "🛡️", MILITARY_AIR_BASE: "✈️", MILITARY_NAVY_BASE: "🚢",
};

interface Offer { id: string; ownerId: string; countryId: string; product: string; quality: number; unitPrice: number; remaining: number }
interface Country { id: string; name: string; code: string }
interface StorageEntry { product: string; quality: number; quantity: number }
interface Me { id: string; locationRegion: { countryId: string; name: string } }

export default function MarketPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [product, setProduct] = useState<string>("FOOD");
  const [quality, setQuality] = useState<string>("1");
  const [qty, setQty] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);

  const { data: me } = useApi<Me>("/auth/me");
  const { data: map } = useApi<{ countries: Country[] }>("/citizens/map");
  const myMarket = me?.locationRegion?.countryId ?? "";
  const market = myMarket;

  const { data: offers, reload } = useApi<Offer[]>(
    market ? `/markets/product?countryId=${market}&product=${product}${(RAW_PRODUCTS as readonly string[]).includes(product) ? "" : `&quality=${quality}`}` : null,
    [market, product, quality],
  );
  const { data: storage, reload: reloadStorage } = useApi<StorageEntry[]>("/citizens/me/storage");

  // Buy-tab filters (product/quality already come from the fetch params)
  const [maxPrice, setMaxPrice] = useState("");
  const [priceSort, setPriceSort] = useState("none");
  const filteredOffers = useMemo(() => {
    let list = offers ?? [];
    if (maxPrice !== "") list = list.filter((o) => o.unitPrice <= Number(maxPrice) * 100);
    if (priceSort === "asc") list = [...list].sort((a, b) => a.unitPrice - b.unitPrice);
    if (priceSort === "desc") list = [...list].sort((a, b) => b.unitPrice - a.unitPrice);
    return list;
  }, [offers, maxPrice, priceSort]);

  const [sellProduct, setSellProduct] = useState("FOOD");
  const [sellQuality, setSellQuality] = useState("1");
  const [sellStock, setSellStock] = useState("1");
  const [sellPrice, setSellPrice] = useState("1.50");

  async function buy(offer: Offer) {
    try {
      const res = await api<{ spent: number }>(`/markets/product/${offer.id}/buy`, { method: "POST", body: { qty: Number(qty) } });
      push(`Purchased ${qty}× ${offer.product.toLowerCase()} for ${res.spent.toFixed(2)} CC (incl. VAT)!`, "success");
      reload(); reloadStorage(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function listOffer() {
    try {
      await api("/markets/product", {
        method: "POST",
        body: { product: sellProduct, quality: Number(sellQuality), unitPrice: Number(sellPrice), stock: Number(sellStock) },
      });
      push(`Offer listed: ${sellStock}× ${sellProduct.toLowerCase()} @ ${sellPrice} CC`, "success");
      reloadStorage(); reload();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function cancel(id: string) {
    try { await api(`/markets/product/${id}/cancel`, { method: "POST" }); push("Offer cancelled — stock returned.", "info"); reload(); reloadStorage(); } catch (e) { push((e as Error).message, "error"); }
  }

  const inventory = useMemo(() => (storage ?? []).filter((s) => s.quantity > 0), [storage]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* STORAGE GRID */}
      <Panel className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
          <span>Storage Unit Grid</span>
          <span className="text-xs text-slate-400">{inventory.length} item types</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {inventory.map((item) => (
            <div key={item.product + item.quality} className="bg-slate-950/90 border border-slate-800 p-3 rounded-xl flex flex-col justify-between space-y-2 relative group hover:border-emerald-500/50 transition">
              <span className="absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                {item.quality > 0 ? `Q${item.quality}` : "RAW"}
              </span>
              <div className="text-3xl text-center py-2">{ICONS[item.product] ?? "📦"}</div>
              <div>
                <div className="text-xs font-bold text-slate-200 truncate">{item.product.toLowerCase()}</div>
                <div className="text-[11px] text-slate-400 font-mono">Amount: <span className="text-slate-100 font-bold">{item.quantity}</span></div>
              </div>
            </div>
          ))}
          {inventory.length === 0 && <p className="text-xs text-slate-500">Storage empty — work produces goods, market buys supplies.</p>}
        </div>
      </Panel>

      <Panel className="p-5 space-y-4">
        <Tabs tabs={[{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }]} value={tab} onChange={setTab} />
        {msg && <p className="text-xs text-cyan-300">{msg}</p>}

        {tab === "buy" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select className="w-40" value={product} onChange={(e) => setProduct(e.target.value)}>
                {PRODUCTS.map((p) => <option key={p} value={p}>{ICONS[p]} {p.toLowerCase()}</option>)}
              </Select>
              {!(RAW_PRODUCTS as readonly string[]).includes(product) && (
                <Select className="w-24" value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {[1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </Select>
              )}
              <Input className="w-20" value={qty} onChange={(e) => setQty(e.target.value)} />
              <Badge color="cyan">📍 {me?.locationRegion.name ?? "your region"}'s market</Badge>
            </div>
            <FilterBar count={filteredOffers.length}>
              <FilterSelect
                label="sort"
                value={priceSort}
                onChange={setPriceSort}
                options={[{ value: "none", label: "—" }, { value: "asc", label: "cheap→expensive" }, { value: "desc", label: "expensive→cheap" }]}
              />
              <FilterNumber label="max price" value={maxPrice} onChange={setMaxPrice} placeholder="CC" />
            </FilterBar>
            <div className="space-y-1.5">
              {filteredOffers.map((o) => (
                <div key={o.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-200">{ICONS[o.product] ?? "📦"} {o.product.toLowerCase()} {o.quality > 0 ? `Q${o.quality}` : "(raw)"}</div>
                    <div className="text-slate-500">stock {o.remaining}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-300">{(o.unitPrice / 100).toFixed(2)} CC</span>
                    <Button size="sm" onClick={() => buy(o)}><ShoppingCart size={12} /> Buy</Button>
                  </div>
                </div>
              ))}
              {filteredOffers.length === 0 && (offers ?? []).length > 0 && <p className="text-xs text-slate-500">No offers match your filters.</p>}
              {(offers ?? []).length === 0 && <p className="text-xs text-slate-500">No offers on this market.</p>}
            </div>
          </div>
        )}

        {tab === "sell" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <p className="mb-1 text-[10px] text-slate-500 uppercase">Product</p>
                <Select className="w-36" value={sellProduct} onChange={(e) => setSellProduct(e.target.value)}>
                  {PRODUCTS.map((p) => <option key={p} value={p}>{ICONS[p]} {p.toLowerCase()}</option>)}
                </Select>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-slate-500 uppercase">Quality</p>
                <Select className="w-20" value={sellQuality} onChange={(e) => setSellQuality(e.target.value)}>
                  {[0, 1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>{q === 0 ? "raw" : `Q${q}`}</option>)}
                </Select>
              </div>
              <div><p className="mb-1 text-[10px] text-slate-500 uppercase">Stock</p><Input className="w-20" value={sellStock} onChange={(e) => setSellStock(e.target.value)} /></div>
              <div><p className="mb-1 text-[10px] text-slate-500 uppercase">Price/piece</p><Input className="w-24" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} /></div>
              <Button onClick={listOffer}><PackagePlus size={13} /> List offer</Button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your active offers</p>
              {(offers ?? []).map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-1.5 text-xs">
                  <Coins size={12} className="text-amber-400" />
                  <span className="flex-1 font-mono">{o.product.toLowerCase()} ×{o.remaining} @ {(o.unitPrice / 100).toFixed(2)}</span>
                  {o.ownerId === me?.id && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(o.id)}><XCircle size={12} /> cancel</Button>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-slate-500">All offers above are on your location's market — VAT & import taxes go to the treasury.</p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
