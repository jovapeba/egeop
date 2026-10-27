"use client";

import { useMemo, useState } from "react";
import { Gavel, Timer, Hammer, Ban } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Select, Tabs, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterNumber, FilterSelect } from "@/lib/filters";

const DURATIONS = [
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
];

interface AuctionBid {
  id: string;
  amount: number;
  bidder: { nickname: string };
}
interface Auction {
  id: string;
  sellerId: string;
  kind: "WA" | "SPECIAL_ITEM";
  itemId: string;
  startPrice: number;
  currentBid: number | null;
  currentBidderId: string | null;
  endsAt: string;
  status: string;
  bids: AuctionBid[];
}
interface MineResponse {
  selling: Auction[];
  bidding: Array<{ id: string; amount: number; auction: Auction }>;
}
interface Me {
  id: string;
  gold: number;
  firstAidKits: number;
}
interface GearItem {
  id: string;
  name: string;
  slot: string;
  quality: number;
}
interface EquipData {
  items: GearItem[];
  equipped: Record<string, string>;
}

function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function minBid(a: Auction): number {
  const top = a.currentBid ?? a.startPrice;
  return top * 1.03; // minimum outbid = top + 3%
}

export default function AuctionsPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"live" | "list" | "mine">("live");

  const { data: auctions, reload } = useApi<Auction[]>("/auctions");
  const { data: mine, reload: reloadMine } = useApi<MineResponse>("/auctions/mine");
  const { data: me } = useApi<Me>("/auth/me");
  const { data: eq } = useApi<EquipData>("/equipment/mine");

  const [itemId, setItemId] = useState("");
  const [startPrice, setStartPrice] = useState("5");
  const [duration, setDuration] = useState("24");
  const [bidAmount, setBidAmount] = useState<Record<string, string>>({});

  const sellable = (eq?.items ?? []).filter(
    (i) => i.id && !Object.values(eq?.equipped ?? {}).includes(i.id),
  );

  // Live-auction filters
  const [kindFilter, setKindFilter] = useState("all");
  const [maxStart, setMaxStart] = useState("");
  const [auctionSort, setAuctionSort] = useState("ending");
  const filteredAuctions = useMemo(() => {
    let list = (auctions ?? []).filter((a) => kindFilter === "all" || a.kind === kindFilter);
    if (maxStart !== "") list = list.filter((a) => a.startPrice <= Number(maxStart) * 100);
    list = [...list].sort((a, b) =>
      auctionSort === "ending"
        ? new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime()
        : (b.currentBid ?? b.startPrice) - (a.currentBid ?? a.startPrice),
    );
    return list;
  }, [auctions, kindFilter, maxStart, auctionSort]);

  async function listAuction() {
    if (!itemId) return push("Select an attachment to auction.", "error");
    try {
      await api("/auctions", {
        method: "POST",
        body: { kind: "WA", itemId, startPriceGold: Number(startPrice), durationHours: Number(duration) },
      });
      push("Auction listed — 1% listing fee charged.", "success");
      setItemId("");
      reload(); reloadMine(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function bid(a: Auction) {
    const amount = bidAmount[a.id] ?? "";
    if (!amount) return push("Enter your bid first.", "error");
    try {
      const res = await api<{ extended: boolean }>(`/auctions/${a.id}/bid`, { method: "POST", body: { amountGold: Number(amount) } });
      push(res.extended ? "Bid placed — sniper rollback: timer reset to 30s!" : "Bid placed!", "success");
      setBidAmount((s) => ({ ...s, [a.id]: "" }));
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function cancel(a: Auction) {
    try {
      await api(`/auctions/${a.id}/cancel`, { method: "POST" });
      push("Auction cancelled — item returned to storage.", "info");
      reload(); reloadMine();
    } catch (e) { push((e as Error).message, "error"); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<Gavel size={14} />}>Auction House — attachments & special items</CardTitle>
        <Tabs
          tabs={[
            { id: "live", label: "Live auctions" },
            { id: "list", label: "List an item" },
            { id: "mine", label: "My activity" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "live" && (
          <div className="space-y-1.5">
            <FilterBar count={filteredAuctions.length}>
              <FilterSelect
                label="kind"
                value={kindFilter}
                onChange={setKindFilter}
                options={[
                  { value: "all", label: "all" },
                  { value: "WA", label: "attachments" },
                  { value: "SPECIAL_ITEM", label: "special items" },
                ]}
              />
              <FilterSelect
                label="sort"
                value={auctionSort}
                onChange={setAuctionSort}
                options={[
                  { value: "ending", label: "ending soon" },
                  { value: "top", label: "top bid" },
                ]}
              />
              <FilterNumber label="max start" value={maxStart} onChange={setMaxStart} placeholder="gold" />
            </FilterBar>
            {filteredAuctions.map((a) => {
              const next = minBid(a);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {a.kind === "WA" ? "Attachment" : "Special item"}{" "}
                      <Badge color="gold">{(a.startPrice / 100).toFixed(2)}g start</Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {a.currentBid ? `Top bid ${(a.currentBid / 100).toFixed(2)}g` : "No bids yet"} ·{" "}
                      <Timer size={11} className="inline" /> {timeLeft(a.endsAt)} · {a.bids.length} bids
                    </p>
                  </div>
                  <Input
                    className="w-24"
                    placeholder={`≥ ${(next / 100).toFixed(2)}`}
                    value={bidAmount[a.id] ?? ""}
                    onChange={(e) => setBidAmount((s) => ({ ...s, [a.id]: e.target.value }))}
                  />
                  <Button size="sm" onClick={() => bid(a)}>
                    <Hammer size={13} /> bid
                  </Button>
                </div>
              );
            })}
            {filteredAuctions.length === 0 && (auctions ?? []).length > 0 && <p className="text-sm text-muted">No auctions match your filters.</p>}
            {(auctions ?? []).length === 0 && (
              <p className="text-sm text-muted">No live auctions — list an attachment or special item.</p>
            )}
            <p className="text-[10px] text-muted">
              Bids are public · minimum outbid = top + 3% · bid in the last 30s rolls the timer back to 30s ·
              seller pays 1% to list and 2% of the final price when sold.
            </p>
          </div>
        )}

        {tab === "list" && (
          <div className="space-y-2">
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">— choose an attachment —</option>
              {sellable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.slot.toUpperCase()})
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Input className="w-28" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder="start price g" />
              <Select className="w-40" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
              <Button onClick={listAuction}>
                <Gavel size={14} /> list auction
              </Button>
            </div>
            <p className="text-[10px] text-muted">
              Listing fee: 1% of the starting price, charged immediately. Cancellation only before the first bid.
            </p>
          </div>
        )}

        {tab === "mine" && (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-muted">Selling</p>
              <div className="space-y-1.5">
                {(mine?.selling ?? []).map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                    <p className="flex-1 text-sm font-bold">
                      {a.kind === "WA" ? "Attachment" : "Special item"} · {(a.startPrice / 100).toFixed(2)}g
                      {a.currentBid ? ` → top ${(a.currentBid / 100).toFixed(2)}g` : ""}
                    </p>
                    <Badge color="cyan">{a.status}</Badge>
                    <span className="text-xs text-muted">{timeLeft(a.endsAt)}</span>
                    {a.status === "ACTIVE" && a.bids.length === 0 && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(a)}>
                        <Ban size={13} /> cancel
                      </Button>
                    )}
                  </div>
                ))}
                {(mine?.selling ?? []).length === 0 && <p className="text-sm text-muted">Nothing listed.</p>}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-muted">Bids placed</p>
              <div className="space-y-1.5">
                {(mine?.bidding ?? []).map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                    <p className="flex-1 text-sm">
                      {(b.amount / 100).toFixed(2)}g on a {b.auction.kind === "WA" ? "attachment" : "special item"}
                    </p>
                    <Badge color={b.auction.status === "ACTIVE" ? "cyan" : "emerald"}>{b.auction.status}</Badge>
                    <span className="text-xs text-muted">{timeLeft(b.auction.endsAt)}</span>
                  </div>
                ))}
                {(mine?.bidding ?? []).length === 0 && <p className="text-sm text-muted">No bids yet.</p>}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
