"use client";

import { useMemo, useState } from "react";
import { Coins, Repeat, XCircle } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Select, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";

interface MonOffer {
  id: string; ownerId: string; sellAsset: string; sellCountryId: string | null;
  sellAmount: number; remaining: number; rate: string; buyAsset: string; buyCountryId: string | null;
}
interface Country { id: string; name: string; code: string; currencyName: string }

export default function MonetaryPage() {
  const { refresh } = useWallet();
  const { data: map } = useApi<{ countries: Country[] }>(`/citizens/map`);
  const countries = map?.countries ?? [];
  const { data: offers, reload } = useApi<MonOffer[]>("/markets/monetary");
  const [msg, setMsg] = useState<string | null>(null);

  const [sellAsset, setSellAsset] = useState<"GOLD" | "FIAT">("GOLD");
  const [sellCountry, setSellCountry] = useState("");
  const [sellAmount, setSellAmount] = useState("1");
  const [rate, setRate] = useState("200");
  const [buyAsset, setBuyAsset] = useState<"GOLD" | "FIAT">("FIAT");
  const [buyCountry, setBuyCountry] = useState("");
  const [buyAmount, setBuyAmount] = useState("1");

  async function post() {
    setMsg(null);
    try {
      await api("/markets/monetary", {
        method: "POST",
        body: {
          sellAsset,
          ...(sellAsset === "FIAT" ? { sellCountryId: sellCountry } : {}),
          sellAmount: Number(sellAmount),
          rate: Number(rate),
          buyAsset,
          ...(buyAsset === "FIAT" ? { buyCountryId: buyCountry } : {}),
        },
      });
      setMsg("Offer posted — amount escrowed.");
      reload(); refresh();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function take(o: MonOffer) {
    setMsg(null);
    try {
      await api(`/markets/monetary/${o.id}/buy`, { method: "POST", body: { amount: Number(buyAmount) } });
      setMsg("Trade executed.");
      reload(); refresh();
    } catch (e) { setMsg((e as Error).message); }
  }

  async function cancel(id: string) {
    try { await api(`/markets/monetary/${id}/cancel`, { method: "POST" }); reload(); } catch (e) { setMsg((e as Error).message); }
  }

  const label = (a: string, cid: string | null) => (a === "GOLD" ? "gold" : countries.find((c) => c.id === cid)?.code ?? "fiat");

  // Open-offers filters: by sold currency and bought currency
  const [sellFilter, setSellFilter] = useState("all");
  const [buyFilter, setBuyFilter] = useState("all");
  const filteredOffers = useMemo(
    () =>
      (offers ?? []).filter(
        (o) =>
          (sellFilter === "all" || label(o.sellAsset, o.sellCountryId) === sellFilter) &&
          (buyFilter === "all" || label(o.buyAsset, o.buyCountryId) === buyFilter),
      ),
    [offers, sellFilter, buyFilter, countries],
  );
  const currencyOptions = useMemo(() => {
    const codes = [...new Set((offers ?? []).flatMap((o) => [label(o.sellAsset, o.sellCountryId), label(o.buyAsset, o.buyCountryId)]))];
    return [{ value: "all", label: "all" }, ...codes.map((c) => ({ value: c, label: c }))];

    function label(a: string, cid: string | null) {
      return a === "GOLD" ? "gold" : countries.find((c) => c.id === cid)?.code ?? "fiat";
    }
  }, [offers, countries]);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Coins size={14} />}>Monetary market — exchange fiat ↔ gold</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="mb-1 text-xs text-muted">Sell</p>
            <Select className="w-24" value={sellAsset} onChange={(e) => setSellAsset(e.target.value as never)}>
              <option value="GOLD">gold</option><option value="FIAT">fiat</option>
            </Select>
          </div>
          {sellAsset === "FIAT" && (
            <Select className="w-32" value={sellCountry} onChange={(e) => setSellCountry(e.target.value)}>
              <option value="">currency…</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </Select>
          )}
          <div><p className="mb-1 text-xs text-muted">Amount</p><Input className="w-24" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} /></div>
          <Repeat size={14} className="mb-2 text-muted" />
          <div>
            <p className="mb-1 text-xs text-muted">Buy</p>
            <Select className="w-24" value={buyAsset} onChange={(e) => setBuyAsset(e.target.value as never)}>
              <option value="FIAT">fiat</option><option value="GOLD">gold</option>
            </Select>
          </div>
          {buyAsset === "FIAT" && (
            <Select className="w-32" value={buyCountry} onChange={(e) => setBuyCountry(e.target.value)}>
              <option value="">currency…</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </Select>
          )}
          <div><p className="mb-1 text-xs text-muted">Rate (buy / 1 sell)</p><Input className="w-28" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <Button onClick={post}>Post offer</Button>
        </div>
        {msg && <p className="mt-2 text-sm text-info">{msg}</p>}
      </Card>

      <Card>
        <CardTitle icon={<Coins size={14} />}>Open offers</CardTitle>
        <FilterBar count={filteredOffers.length}>
          <FilterSelect label="sells" value={sellFilter} onChange={setSellFilter} options={currencyOptions} />
          <FilterSelect label="buys" value={buyFilter} onChange={setBuyFilter} options={currencyOptions} />
        </FilterBar>
        <div className="space-y-1.5">
          {filteredOffers.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
              <div className="flex-1 text-sm">
                <span className="font-bold">{label(o.sellAsset, o.sellCountryId)} → {label(o.buyAsset, o.buyCountryId)}</span>
                <span className="text-xs text-muted"> · rate {Number(o.rate).toPrecision(6)} · left {(o.remaining / 100).toFixed(2)}</span>
              </div>
              <Input className="w-20" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} />
              <Button size="sm" onClick={() => take(o)}>Trade</Button>
              <Button size="sm" variant="ghost" onClick={() => cancel(o.id)}>cancel</Button>
            </div>
          ))}
          {filteredOffers.length === 0 && (offers ?? []).length > 0 && <p className="text-sm text-muted">No offers match your filters.</p>}
          {(offers ?? []).length === 0 && <p className="text-sm text-muted">No monetary offers yet.</p>}
        </div>
      </Card>
    </div>
  );
}
