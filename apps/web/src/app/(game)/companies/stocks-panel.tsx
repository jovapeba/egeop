"use client";

import { useMemo, useState } from "react";
import { LineChart, PlusCircle, Vote, ThumbsUp, ThumbsDown, HandCoins, XCircle, Building2 } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Select, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterToggle, SearchInput, matches } from "@/lib/filters";
import { RatingWidget } from "@/components/rating-widget";

interface JscSummary {
  id: string;
  name: string;
  sharesTotal: number;
  treasuryGold: number;
  issuePrice: number;
  ceoId: string;
  ceo: { nickname: string };
  _count: { shares: number };
}
interface MyShare {
  id: string;
  quantity: number;
  jsc: { id: string; name: string; sharesTotal: number; treasuryGold: number; issuePrice: number; ceoId: string };
}
interface JscDetail extends JscSummary {
  shares: Array<{ id: string; quantity: number; holder: { id: string; nickname: string } }>;
  orders: Array<{ id: string; side: string; price: number; remaining: number; ownerId: string }>;
  dividends: Array<{ id: string; totalGold: number; perShare: number; createdAt: string }>;
  polls: Array<{
    id: string;
    kind: string;
    status: string;
    yesWeight: number;
    noWeight: number;
    closesAt: string;
    payload: Record<string, unknown>;
  }>;
  trades: Array<{ id: string; quantity: number; price: number; buyerId: string; sellerId: string; createdAt: string }>;
}

const POLL_KINDS = [
  { kind: "DIVIDENDS", label: "Dividends", field: "totalGold", placeholder: "total g" },
  { kind: "ISSUE_SHARES", label: "Issue shares", field: "quantity", placeholder: "qty" },
  { kind: "SET_PRICE", label: "Set issue price", field: "priceGold", placeholder: "price g" },
] as const;

export function StocksPanel() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const { data: mine, reload: reloadMine } = useApi<MyShare[]>("/stocks/mine");
  const { data: all, reload: reloadAll } = useApi<JscSummary[]>("/stocks");
  const { data: me } = useApi<{ id: string }>("/auth/me");
  const [sel, setSel] = useState<string | null>(null);
  const { data: detail, reload: reloadDetail } = useApi<JscDetail>(sel ? `/stocks/${sel}` : null, [sel]);

  // forms
  const [newName, setNewName] = useState("");
  const [newShares, setNewShares] = useState("1000");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("1");
  const [pollKind, setPollKind] = useState<string>("DIVIDENDS");
  const [pollAmount, setPollAmount] = useState("10");

  const g = (v: number | string) => (Number(v ?? 0) / 100).toFixed(2);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      push(ok, "success");
      reloadMine();
      reloadAll();
      reloadDetail();
      refresh();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  const isCeo = !!detail && detail.ceoId === me?.id;
  const myHolding = detail?.shares.find((s) => s.holder.id === me?.id)?.quantity ?? 0;

  // Exchange listing filters
  const [jscSearch, setJscSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const myJscIds = useMemo(() => new Set((mine ?? []).map((s) => s.jsc.id)), [mine]);
  const filteredJscs = useMemo(
    () =>
      (all ?? []).filter(
        (j) => matches(j.name, jscSearch) && matches(j.ceo.nickname, jscSearch) && (!mineOnly || myJscIds.has(j.id)),
      ),
    [all, jscSearch, mineOnly, myJscIds],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<LineChart size={14} />}>Stock Exchange — Joint-Stock Companies (CEO voting engine)</CardTitle>

        {/* MY SHARES */}
        <div className="space-y-1.5 mb-4">
          <p className="text-[10px] font-bold uppercase text-muted">My portfolio</p>
          {(mine ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
              <Building2 size={13} className="text-slate-500" />
              <span className="flex-1 font-bold">{s.jsc.name}</span>
              <Badge color="cyan">×{s.quantity} shares</Badge>
              <Badge color="slate">{Math.round((s.quantity / s.jsc.sharesTotal) * 100)}% stake</Badge>
              {s.jsc.ceoId === me?.id && <Badge color="gold">👑 CEO</Badge>}
              <Button size="sm" variant="outline" onClick={() => setSel(s.jsc.id)}>
                open
              </Button>
            </div>
          ))}
          {(mine ?? []).length === 0 && <p className="text-sm text-muted">No shares held — buy into a JSC below.</p>}
        </div>

        {/* CREATE JSC */}
        <div className="flex flex-wrap items-end gap-2 mb-4 border-t border-line pt-3">
          <div>
            <p className="mb-1 text-xs text-muted">Found a JSC — 100g (50g fee + 50g treasury)</p>
            <Input className="w-56" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">Initial shares</p>
            <Input className="w-24" value={newShares} onChange={(e) => setNewShares(e.target.value)} />
          </div>
          <Button
            onClick={() =>
              act(
                () => api("/stocks", { method: "POST", body: { name: newName, sharesTotal: Number(newShares) || 1000 } }),
                "JSC founded — you are CEO of the full initial issue.",
              )
            }
          >
            <PlusCircle size={14} /> found JSC
          </Button>
        </div>

        {/* JSC BROWSER */}
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-[10px] font-bold uppercase text-muted">Exchange listing</p>
          <FilterBar count={filteredJscs.length}>
            <SearchInput className="w-44" value={jscSearch} onChange={setJscSearch} placeholder="name or CEO…" />
            <FilterToggle label="my holdings only" checked={mineOnly} onChange={setMineOnly} />
          </FilterBar>
          {filteredJscs.map((j) => (
            <button
              key={j.id}
              onClick={() => setSel(sel === j.id ? null : j.id)}
              className={`w-full text-left flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                sel === j.id ? "border-emerald-500/60 bg-emerald-950/20" : "border-line bg-panel hover:border-slate-600"
              }`}
            >
              <span className="flex-1 font-bold">{j.name}</span>
              <RatingWidget targetType="STOCK_COMPANY" targetId={j.id} />
              <Badge color="slate">CEO {j.ceo.nickname}</Badge>
              <Badge color="cyan">{j._count.shares} holders</Badge>
              <Badge color="gold">issue {g(j.issuePrice)}g</Badge>
              <Badge color="purple">treasury {g(j.treasuryGold)}g</Badge>
            </button>
          ))}
          {filteredJscs.length === 0 && (all ?? []).length > 0 && <p className="text-sm text-muted">No JSCs match your filters.</p>}
          {(all ?? []).length === 0 && <p className="text-sm text-muted">No JSCs listed yet.</p>}
        </div>

        {/* DETAIL */}
        {sel && detail && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black">{detail.name}</h3>
              <RatingWidget targetType="STOCK_COMPANY" targetId={detail.id} />
              {isCeo && <Badge color="gold">👑 you are CEO</Badge>}
              {myHolding > 0 && <Badge color="cyan">you hold ×{myHolding}</Badge>}
              <Badge color="slate">
                {detail.sharesTotal} shares · {detail.shares.length} holders
              </Badge>
            </div>

            {/* ORDER BOOK */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-muted">Open orders</p>
                {detail.orders.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                    <Badge color={o.side === "SELL" ? "red" : "emerald"}>{o.side}</Badge>
                    <span className="flex-1 font-mono">
                      ×{o.remaining} @ {g(o.price)}g
                    </span>
                    {o.ownerId === me?.id && (
                      <Button size="sm" variant="ghost" onClick={() => act(() => api(`/stocks/orders/${o.id}/cancel`, { method: "POST" }), "Order cancelled.")}>
                        <XCircle size={12} /> cancel
                      </Button>
                    )}
                  </div>
                ))}
                {detail.orders.length === 0 && <p className="text-xs text-muted">No open orders.</p>}
                <div className="flex flex-wrap items-end gap-2 pt-2">
                  <Select className="w-24" value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
                    <option value="BUY">buy</option>
                    <option value="SELL">sell</option>
                  </Select>
                  <Input className="w-20" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" />
                  <Input className="w-24" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="g/share" />
                  <Button
                    size="sm"
                    onClick={() =>
                      act(
                        () =>
                          api(`/stocks/${detail.id}/orders`, {
                            method: "POST",
                            body: { side, quantity: Number(qty), price: Math.round(Number(price) * 100) },
                          }),
                        `${side} order placed${side === "BUY" ? " — 2% escrow fee" : " — shares escrowed"}.`,
                      )
                    }
                  >
                    <HandCoins size={13} /> place order
                  </Button>
                  <p className="text-[10px] text-muted w-full">Limit orders: BUY escrows gold (2% fee), SELL escrows shares. Matching is price-time priority.</p>
                </div>
              </div>

              {/* POLLS */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-muted">CEO polls — &gt;50% of all shares to pass</p>
                {detail.polls.map((p) => {
                  const open = p.status === "VOTING";
                  return (
                    <div key={p.id} className="rounded-lg border border-line bg-panel p-2.5 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge color="cyan">{p.kind}</Badge>
                        <Badge color={open ? "gold" : p.status === "PASSED" ? "emerald" : "slate"}>{open ? "VOTING" : p.status}</Badge>
                        <span className="font-mono text-xs">
                          ✓ {Number(p.yesWeight).toLocaleString()} / ✗ {Number(p.noWeight).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted truncate">{JSON.stringify(p.payload)}</p>
                      {open && myHolding > 0 && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="success" onClick={() => act(() => api(`/stocks/polls/${p.id}/vote`, { method: "POST", body: { yes: true } }), `Voted YES with ${myHolding} shares.`)}>
                            <ThumbsUp size={11} /> yes
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => act(() => api(`/stocks/polls/${p.id}/vote`, { method: "POST", body: { yes: false } }), "Voted NO.")}>
                            <ThumbsDown size={11} /> no
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {detail.polls.length === 0 && <p className="text-xs text-muted">No polls yet.</p>}

                {isCeo && (
                  <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-line">
                    <Select className="w-36" value={pollKind} onChange={(e) => setPollKind(e.target.value)}>
                      {POLL_KINDS.map((k) => (
                        <option key={k.kind} value={k.kind}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                    <Input className="w-24" value={pollAmount} onChange={(e) => setPollAmount(e.target.value)} placeholder="amount" />
                    <Button
                      size="sm"
                      onClick={() => {
                        const def = POLL_KINDS.find((k) => k.kind === pollKind)!;
                        const payload =
                          def.kind === "DIVIDENDS"
                            ? { totalGold: Number(pollAmount) }
                            : def.kind === "ISSUE_SHARES"
                            ? { quantity: Number(pollAmount) }
                            : { priceGold: Number(pollAmount) };
                        act(() => api(`/stocks/${detail.id}/polls`, { method: "POST", body: { kind: def.kind, payload } }), "Poll proposed — 48h voting window.");
                      }}
                    >
                      <Vote size={13} /> propose poll
                    </Button>
                    <p className="text-[10px] text-muted w-full">
                      Dividends pay per-share from treasury · issue shares mint to CEO · set price changes the share-issue price.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* DIVIDENDS */}
            {detail.dividends.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-muted">Dividend history</p>
                {detail.dividends.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg bg-panel px-3 py-1.5 text-xs">
                    <HandCoins size={11} className="text-amber-400" />
                    <span className="flex-1">
                      total {g(d.totalGold)}g · {g(d.perShare)}g/share
                    </span>
                    <span className="text-slate-600">{new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
