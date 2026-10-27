"use client";

import { useMemo, useState } from "react";
import {
  Shield,
  Crown,
  Package,
  Send,
  Users,
  Plus,
  ArrowRightLeft,
  ChevronRight,
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Swords,
  Coins,
  Search,
  UserCheck,
  UserPlus,
  AlertTriangle,
  LogOut,
  Target,
  Eye,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, Input, Panel, PanelTitle, cn, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect, FilterToggle } from "@/lib/filters";

const LEVEL_NAMES = ["Novice", "Regular", "Veteran", "Elite"];

interface CitizenCountry {
  id: string;
  name: string;
  code: string;
  flagColor?: string;
}

interface CitizenSummary {
  id: string;
  nickname: string;
  level: number;
  avatarColor?: string;
  strength?: number;
  totalDamage?: number;
  citizenshipCountry?: { id: string; name: string; code: string; flagColor?: string };
}

interface MuMember {
  citizenId: string;
  rank: "COMMANDER" | "CAPTAIN" | "RECRUIT";
  joinedAt: string;
  citizen: CitizenSummary;
}

interface MuStorageEntry {
  id: string;
  product: string;
  quality: number;
  quantity: number;
}

interface MuOrder {
  id: string;
  battleId: string;
  side: "ATTACKER" | "DEFENDER";
  active: boolean;
  battle?: {
    id: string;
    region: { id: string; name: string };
    war?: {
      attackerCountry: { name: string; code: string; flagColor?: string };
      defenderCountry: { name: string; code: string; flagColor?: string };
    };
  };
}

interface MuApplication {
  id: string;
  citizenId: string;
  message?: string;
  createdAt: string;
  citizen: CitizenSummary;
}

/** Shape of GET /mu/mine: the caller's membership row with the raw unit nested. */
interface MineMembership {
  rank: "COMMANDER" | "CAPTAIN" | "RECRUIT";
  joinedAt: string;
  mu: { id: string };
}

interface MuDetail {
  id: string;
  name: string;
  description?: string;
  countryId: string;
  leaderId: string;
  levelIdx: number;
  memberSlots: number;
  slots: number;
  gold: number;
  damageBonus: number;
  rankName?: string;
  recruitmentOpen: boolean;
  countryOnly: boolean;
  createdAt: string;
  country?: CitizenCountry;
  leader?: CitizenSummary;
  members: MuMember[];
  storage: MuStorageEntry[];
  orders: MuOrder[];
  applications?: MuApplication[];
  userMembership?: { rank: "COMMANDER" | "CAPTAIN" | "RECRUIT"; joinedAt: string } | null;
  _count?: { members: number };
}

interface MuListItem {
  id: string;
  name: string;
  description?: string;
  countryId: string;
  leaderId: string;
  levelIdx: number;
  slots: number;
  gold: number;
  damageBonus: number;
  recruitmentOpen: boolean;
  countryOnly: boolean;
  country?: CitizenCountry;
  leader?: CitizenSummary;
  _count: { members: number };
}

interface UserStorageEntry {
  id: string;
  product: string;
  quality: number;
  quantity: number;
}

interface War {
  id: string;
  attackerCountry: { name: string };
  defenderCountry: { name: string };
  battles: Array<{ id: string; region: { name: string } }>;
}

export default function MuPage() {
  const { push } = useToast();
  const { refresh } = useWallet();

  // Active data
  const { data: myMembership, reload: reloadMembership, loading: loadingMembership } = useApi<MineMembership | null>("/mu/mine");
  const myMuId = myMembership?.mu?.id ?? null;
  const { data: myMuDetail, reload: reloadDetail, loading: loadingDetail } = useApi<MuDetail | null>(myMuId ? `/mu/${myMuId}` : null);
  // /mu/mine returns the membership row with the raw unit nested under "mu";
  // the "my" tab needs the full detail (members/storage/orders) plus the
  // caller's rank, so chain membership → detail and stitch them together.
  const myMu: MuDetail | null = useMemo(
    () =>
      myMuDetail && myMembership
        ? { ...myMuDetail, userMembership: { rank: myMembership.rank, joinedAt: myMembership.joinedAt } }
        : null,
    [myMuDetail, myMembership],
  );
  const loadingMyMu = loadingMembership || (!!myMuId && loadingDetail);
  const reloadMyMu = () => {
    reloadMembership();
    reloadDetail();
  };
  const { data: allMus, reload: reloadMus } = useApi<MuListItem[]>("/mu");
  const { data: userStorage, reload: reloadUserStorage } = useApi<UserStorageEntry[]>("/citizens/me/storage");
  const { data: wars } = useApi<War[]>("/wars");

  // Navigation tab
  const [tab, setTab] = useState<"my" | "browse" | "found">("my");
  const [selectedMuId, setSelectedMuId] = useState<string | null>(null);
  const [browsedMu, setBrowsedMu] = useState<MuDetail | null>(null);
  const [loadingBrowsed, setLoadingBrowsed] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState("");

  // Create Form State
  const [foundName, setFoundName] = useState("");
  const [foundDesc, setFoundDesc] = useState("");
  const [foundBusy, setFoundBusy] = useState(false);

  // Distribute Supplies Modal / Panel State
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [distTargetMemberId, setDistTargetMemberId] = useState<string>("");
  const [distToAll, setDistToAll] = useState(false);
  const [distProduct, setDistProduct] = useState<string>("AMMO");
  const [distQuality, setDistQuality] = useState<number>(1);
  const [distQty, setDistQty] = useState<string>("5");
  const [distBusy, setDistBusy] = useState(false);

  // Deposit Supplies Modal / Panel State
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositKind, setDepositKind] = useState<"PRODUCT" | "GOLD">("PRODUCT");
  const [depositProduct, setDepositProduct] = useState<string>("AMMO");
  const [depositQuality, setDepositQuality] = useState<number>(1);
  const [depositQty, setDepositQty] = useState<string>("5");
  const [depositGold, setDepositGold] = useState<string>("5");
  const [depositBusy, setDepositBusy] = useState(false);

  // Inspect specific MU from browse list
  const handleSelectMu = async (id: string) => {
    setSelectedMuId(id);
    setLoadingBrowsed(true);
    try {
      const data = await api<MuDetail>(`/mu/${id}`);
      setBrowsedMu(data);
    } catch (e: any) {
      push(e.message || "Failed to load unit details", "error");
    } finally {
      setLoadingBrowsed(false);
    }
  };

  // The active MU being displayed
  const currentMu: MuDetail | null = useMemo(() => {
    if (tab === "my" && myMu) return myMu;
    if (browsedMu && selectedMuId === browsedMu.id) return browsedMu;
    return myMu;
  }, [tab, myMu, browsedMu, selectedMuId]);

  const isLeader =
    currentMu?.userMembership?.rank === "COMMANDER" ||
    currentMu?.userMembership?.rank === "CAPTAIN";
  const isCommander = currentMu?.userMembership?.rank === "COMMANDER";

  // Filtered MUs
  const [muCountry, setMuCountry] = useState("all");
  const [openOnly, setOpenOnly] = useState(false);
  const muCountries = useMemo(
    () => [...new Map((allMus ?? []).filter((m) => m.country).map((m) => [m.country!.id, m.country!])).values()],
    [allMus],
  );
  const filteredMus = useMemo(() => {
    return (allMus ?? []).filter((m) => {
      if (muCountry !== "all" && m.country?.id !== muCountry) return false;
      if (openOnly && !m.recruitmentOpen) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.country?.name.toLowerCase().includes(q) ||
        m.leader?.nickname.toLowerCase().includes(q)
      );
    });
  }, [allMus, search, muCountry, openOnly]);

  // Execute action helper
  const handleAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    try {
      await fn();
      push(successMsg, "success");
      reloadMyMu();
      reloadMus();
      reloadUserStorage();
      refresh();
      if (selectedMuId) {
        handleSelectMu(selectedMuId);
      }
    } catch (err: any) {
      push(err.message || "Action failed", "error");
    }
  };

  // Join Military Unit
  const handleJoin = (muId: string) => {
    handleAction(
      () => api(`/mu/${muId}/join`, { method: "POST" }),
      "Welcome to the Military Unit! Enlisted as Recruit.",
    );
  };

  // Apply to Military Unit
  const handleApply = (muId: string) => {
    const msg = prompt("Enter enlistment message to commander (optional):", "Ready to serve!");
    if (msg === null) return;
    handleAction(
      () => api(`/mu/${muId}/apply`, { method: "POST", body: { message: msg } }),
      "Enlistment application submitted to unit leadership!",
    );
  };

  // Found new MU
  const handleFoundMu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundName.trim() || foundName.trim().length < 3) {
      push("Military Unit name must be at least 3 characters", "error");
      return;
    }
    setFoundBusy(true);
    try {
      const created = await api<MuDetail>("/mu", {
        method: "POST",
        body: { name: foundName.trim(), description: foundDesc.trim() || undefined },
      });
      push(`Military Unit "${created.name}" established! You are the Commander.`, "success");
      setFoundName("");
      setFoundDesc("");
      reloadMyMu();
      reloadMus();
      refresh();
      setTab("my");
    } catch (err: any) {
      push(err.message || "Failed to found Military Unit", "error");
    } finally {
      setFoundBusy(false);
    }
  };

  // Distribute supplies to members
  const handleDistributeSupplies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMu) return;
    const qty = parseInt(distQty, 10);
    if (!qty || qty <= 0) {
      push("Enter a valid quantity to distribute", "error");
      return;
    }
    if (!distToAll && !distTargetMemberId) {
      push("Select a recipient member from the unit", "error");
      return;
    }

    setDistBusy(true);
    try {
      await api(`/mu/${currentMu.id}/distribute`, {
        method: "POST",
        body: {
          recipientId: distToAll ? undefined : distTargetMemberId,
          distributeToAll: distToAll,
          product: distProduct,
          quality: distQuality,
          qty,
        },
      });
      push("Supplies successfully distributed from unit armory!", "success");
      setShowDistributeModal(false);
      reloadMyMu();
      if (selectedMuId) handleSelectMu(selectedMuId);
      reloadUserStorage();
    } catch (err: any) {
      push(err.message || "Failed to distribute supplies", "error");
    } finally {
      setDistBusy(false);
    }
  };

  // Deposit supplies into MU storage
  const handleDepositSupplies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMu) return;
    setDepositBusy(true);
    try {
      if (depositKind === "GOLD") {
        const goldVal = parseFloat(depositGold);
        if (!goldVal || goldVal <= 0) throw new Error("Enter a valid gold amount");
        await api(`/mu/${currentMu.id}/vault`, {
          method: "POST",
          body: { gold: goldVal },
        });
        push(`Deposited ${goldVal} Gold into unit treasury!`, "success");
      } else {
        const qty = parseInt(depositQty, 10);
        if (!qty || qty <= 0) throw new Error("Enter a valid quantity");
        await api(`/mu/${currentMu.id}/vault`, {
          method: "POST",
          body: { product: depositProduct, quality: depositQuality, qty },
        });
        push(`Deposited ${qty}x Q${depositQuality} ${depositProduct} into unit armory!`, "success");
      }
      setShowDepositModal(false);
      reloadMyMu();
      if (selectedMuId) handleSelectMu(selectedMuId);
      reloadUserStorage();
      refresh();
    } catch (err: any) {
      push(err.message || "Failed to deposit into unit storage", "error");
    } finally {
      setDepositBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* HEADER HERO */}
      <Panel className="p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl shadow-inner">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-100">Military Units</h1>
                <Badge color="emerald">Combat Divisions</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organized fighting forces. Share orders, pool weapons & supplies, and coordinate tactical warfare.
              </p>
            </div>
          </div>

          {/* TOP TABS */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl self-start md:self-auto">
            {myMu && (
              <button
                type="button"
                onClick={() => {
                  setTab("my");
                  setSelectedMuId(null);
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                  tab === "my"
                    ? "bg-emerald-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>My Unit</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setTab("browse");
                setSelectedMuId(null);
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                tab === "browse"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Browse Units</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("found");
                setSelectedMuId(null);
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                tab === "found"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Found a Unit</span>
            </button>
          </div>
        </div>
      </Panel>

      {/* ========================================================================= */}
      {/* TAB 1: MY UNIT DASHBOARD                                                  */}
      {/* ========================================================================= */}
      {tab === "my" && (
        <>
          {!myMu ? (
            <Panel className="p-12 text-center space-y-4 border border-dashed border-slate-800">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                <Shield className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-200">You are not enlisted in a Military Unit</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Join an existing fighting division to receive combat orders and weapon supplies, or establish your own unit.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="success" onClick={() => setTab("browse")}>
                  <Users className="w-4 h-4 mr-1.5" /> Browse Units
                </Button>
                <Button variant="outline" onClick={() => setTab("found")}>
                  <Plus className="w-4 h-4 mr-1.5" /> Found New Unit (50g)
                </Button>
              </div>
            </Panel>
          ) : (
            <div className="space-y-6">
              {/* UNIT OVERVIEW BANNER */}
              <Panel className="p-6 border border-slate-800 bg-slate-950/70 relative overflow-hidden" glow>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-800/80 pb-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-2xl font-black text-slate-100">{myMu.name}</h2>
                      <Badge color="emerald">{LEVEL_NAMES[myMu.levelIdx] || "Division"}</Badge>
                      <Badge color={myMu.userMembership?.rank === "COMMANDER" ? "gold" : myMu.userMembership?.rank === "CAPTAIN" ? "cyan" : "slate"}>
                        {myMu.userMembership?.rank || "MEMBER"}
                      </Badge>
                      {myMu.country && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: myMu.country.flagColor || "#3b82f6" }} />
                          <span>{myMu.country.name}</span>
                        </div>
                      )}
                    </div>
                    {myMu.description && (
                      <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">{myMu.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                      <div>
                        Commander: <span className="font-bold text-slate-200">{myMu.leader?.nickname || "Unknown"}</span>
                      </div>
                      <div>
                        Capacity: <span className="font-bold text-slate-200">{myMu.members.length} / {myMu.slots} Soldiers</span>
                      </div>
                      <div className="text-emerald-400 font-bold">
                        +{Math.round(myMu.damageBonus * 100)}% Damage Bonus (on active order)
                      </div>
                    </div>
                  </div>

                  {/* COMMANDER ACTIONS */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isCommander && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(() => api(`/mu/${myMu.id}/upgrade`, { method: "POST" }), "Military Unit level upgraded!")}
                          title="Upgrade Unit Tier"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-400" /> Upgrade Tier
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(() => api(`/mu/${myMu.id}/expand`, { method: "POST" }), "Expanded +10 member slots!")}
                          title="Add 10 Member Slots"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1 text-cyan-400" /> +10 Slots
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (confirm("Are you sure you want to leave this Military Unit?")) {
                          handleAction(() => api("/mu/leave", { method: "POST" }), "You have left the Military Unit.");
                        }
                      }}
                      title="Leave Unit"
                    >
                      <LogOut className="w-3.5 h-3.5 mr-1" /> Leave
                    </Button>
                  </div>
                </div>

                {/* DAILY BATTLE ORDER DISPLAY */}
                <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Priority Combat Order:</span>
                    {myMu.orders && myMu.orders[0] ? (
                      <span className="text-xs font-black text-rose-400">
                        Fight for {myMu.orders[0].side} in {myMu.orders[0].battle?.region?.name || "Active Battle"}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No campaign order set for today</span>
                    )}
                  </div>

                  {/* Set Order Selector for Officers */}
                  {isLeader && (
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {(wars ?? [])
                        .flatMap((w) => w.battles.map((b) => ({ ...b, war: w })))
                        .slice(0, 3)
                        .map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleAction(() => api(`/mu/${myMu.id}/orders`, { method: "POST", body: { battleId: b.id, side: "ATTACKER" } }), "Daily order set!")}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
                          >
                            Set: {b.region.name} (Atk)
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </Panel>

              {/* ARMORY & SUPPLIES VAULT SECTION (Core Feature) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* VAULT OVERVIEW */}
                <Panel className="p-5 lg:col-span-2 border border-slate-800 bg-slate-950/60 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                        Unit Armory & Supplies Storage
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowDepositModal(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Deposit Supplies
                      </Button>

                      {isLeader && (
                        <Button size="sm" variant="success" onClick={() => setShowDistributeModal(true)}>
                          <Send className="w-3.5 h-3.5 mr-1" /> Distribute Supplies
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* VAULT STATS CARDS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Treasury</span>
                      <span className="text-base font-black text-amber-400 font-mono mt-1">
                        🪙 {(myMu.gold || 0).toFixed(2)}g
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Total Weapons</span>
                      <span className="text-base font-black text-rose-400 font-mono mt-1">
                        ⚔️ {myMu.storage.filter((s) => s.product === "AMMO").reduce((a, b) => a + b.quantity, 0)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Rations (Food)</span>
                      <span className="text-base font-black text-emerald-400 font-mono mt-1">
                        🍞 {myMu.storage.filter((s) => s.product === "FOOD").reduce((a, b) => a + b.quantity, 0)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Gifts & Medkits</span>
                      <span className="text-base font-black text-cyan-400 font-mono mt-1">
                        🎁 {myMu.storage.filter((s) => s.product === "ENERGY_DRINK" || s.product === "FIRST_AID_KIT").reduce((a, b) => a + b.quantity, 0)}
                      </span>
                    </div>
                  </div>

                  {/* INVENTORY STOCK TABLE */}
                  <div className="space-y-2 pt-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Current Supplies in Vault
                    </div>

                    {myMu.storage.length === 0 ? (
                      <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-500">
                        The unit armory is currently empty. Members can donate weapons and food to supply comrades!
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {myMu.storage.map((s) => (
                          <div
                            key={s.id || s.product + s.quality}
                            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {s.product === "AMMO" ? "⚔️" : s.product === "FOOD" ? "🍞" : s.product === "ENERGY_DRINK" ? "🥤" : s.product === "FIRST_AID_KIT" ? "🩹" : "📦"}
                              </span>
                              <div>
                                <div className="text-xs font-bold text-slate-200">
                                  {s.product} {s.quality > 0 ? `Q${s.quality}` : ""}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  In Vault
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/40 px-2 py-0.5 rounded">
                              ×{s.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 1-CLICK SUPPLY BUTTON FOR LEADERS */}
                  {isLeader && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Quickly disburse equal rations & weapons to all {myMu.members.length} soldiers:</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(() => api(`/mu/${myMu.id}/supply`, { method: "POST" }), "1-Click automated supplies dispatched!")}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" /> 1-Click Supply All
                      </Button>
                    </div>
                  )}
                </Panel>

                {/* RECRUITS & APPLICANTS PANEL */}
                <Panel className="p-5 border border-slate-800 bg-slate-950/60 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">
                        Pending Enlistments
                      </h3>
                    </div>
                    <Badge color="cyan">{(myMu.applications ?? []).length} Pending</Badge>
                  </div>

                  {myMu.applications && myMu.applications.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {myMu.applications.map((app) => (
                        <div
                          key={app.id}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">{app.citizen.nickname}</span>
                            <span className="text-[10px] text-slate-400">Lv. {app.citizen.level}</span>
                          </div>
                          {app.message && (
                            <p className="text-[11px] text-slate-400 italic">"{app.message}"</p>
                          )}
                          {isLeader && (
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="success"
                                className="w-full text-xs py-1"
                                onClick={() => handleAction(() => api(`/mu/applications/${app.id}/accept`, { method: "POST" }), `Accepted ${app.citizen.nickname}!`)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs py-1"
                                onClick={() => handleAction(() => api(`/mu/applications/${app.id}/decline`, { method: "POST" }), `Declined ${app.citizen.nickname}.`)}
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No pending applications at this time.
                    </p>
                  )}
                </Panel>
              </div>

              {/* ROSTER TABLE */}
              <Panel className="p-5 border border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                      Unit Roster ({myMu.members.length} Members)
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myMu.members.map((m) => (
                    <div
                      key={m.citizenId}
                      className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm"
                          style={{ backgroundColor: m.citizen.avatarColor || "#475569" }}
                        >
                          {m.citizen.nickname.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-200 truncate">{m.citizen.nickname}</span>
                            <span className="text-[10px] text-slate-400">Lv.{m.citizen.level}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <Badge color={m.rank === "COMMANDER" ? "gold" : m.rank === "CAPTAIN" ? "cyan" : "slate"}>
                              {m.rank}
                            </Badge>
                            <span>STR {m.citizen.strength ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Commander promote actions */}
                      {isCommander && m.citizenId !== myMu.leaderId && (
                        <div className="flex items-center gap-1 shrink-0">
                          {m.rank === "RECRUIT" && (
                            <button
                              type="button"
                              onClick={() => handleAction(() => api(`/mu/${myMu.id}/promote`, { method: "POST", body: { citizenId: m.citizenId, rank: "CAPTAIN" } }), `Promoted ${m.citizen.nickname} to Captain!`)}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-cyan-300 border border-slate-700"
                              title="Promote to Captain"
                            >
                              Make Captain
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BROWSE ALL UNITS                                                   */}
      {/* ========================================================================= */}
      {tab === "browse" && selectedMuId && loadingBrowsed && (
        <Panel className="p-10 text-center text-sm text-slate-400">Loading unit details…</Panel>
      )}

      {/* PUBLIC UNIT INSPECTOR — any citizen can view a unit's public profile
          (profile, stats, roster). Vault & battle orders are member-only and
          are never rendered in this view. */}
      {tab === "browse" && selectedMuId && !loadingBrowsed && browsedMu?.id === selectedMuId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedMuId(null)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Units
            </Button>
            {browsedMu.recruitmentOpen ? (
              <Badge color="emerald">recruitment open</Badge>
            ) : (
              <Badge color="slate">recruitment closed</Badge>
            )}
          </div>

          <Panel className="p-6 space-y-4 border border-slate-800 bg-slate-950/70">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-100 truncate">{browsedMu.name}</h2>
                  <Badge color="emerald">{browsedMu.rankName || LEVEL_NAMES[browsedMu.levelIdx] || "Novice"}</Badge>
                </div>
                {browsedMu.country && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: browsedMu.country.flagColor || "#3b82f6" }}
                    />
                    <span>{browsedMu.country.name}</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-mono font-bold text-slate-200">
                  {browsedMu._count?.members ?? browsedMu.members.length} / {browsedMu.slots}
                </span>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Soldiers</p>
              </div>
            </div>

            {browsedMu.description && (
              <p className="text-sm text-slate-300 leading-relaxed">{browsedMu.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-3 border-t border-slate-800/80">
              <div>
                Commander: <span className="font-bold text-slate-200">{browsedMu.leader?.nickname || "Unknown"}</span>
              </div>
              <div className="text-emerald-400 font-bold">
                +{Math.round(browsedMu.damageBonus * 100)}% Damage Bonus (on active order)
              </div>
            </div>

            {/* Same enlist rules as the directory cards */}
            <div className="pt-1">
              {browsedMu.userMembership ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-emerald-500/40 text-emerald-300"
                  onClick={() => {
                    setSelectedMuId(null);
                    setTab("my");
                  }}
                >
                  <Shield className="w-3.5 h-3.5 mr-1 text-emerald-400" /> You serve in this unit
                </Button>
              ) : myMu ? (
                <Button size="sm" variant="outline" disabled className="w-full text-xs opacity-50" title="Leave your current unit before joining another">
                  Enlisted elsewhere
                </Button>
              ) : browsedMu.recruitmentOpen && (browsedMu._count?.members ?? browsedMu.members.length) < browsedMu.slots ? (
                <Button size="sm" variant="success" className="w-full text-xs" onClick={() => handleJoin(browsedMu.id)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1" /> Enlist in Unit
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handleApply(browsedMu.id)}>
                  Apply for Enlistment
                </Button>
              )}
            </div>
          </Panel>

          {/* PUBLIC ROSTER */}
          <Panel className="p-5 border border-slate-800 bg-slate-950/60 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Users className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                Unit Roster ({browsedMu.members.length} Members)
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {browsedMu.members.map((m) => (
                <div
                  key={m.citizenId}
                  className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-2.5"
                >
                  <div
                    className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: m.citizen.avatarColor || "#475569" }}
                  >
                    {m.citizen.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200 truncate">{m.citizen.nickname}</span>
                      <span className="text-[10px] text-slate-400">Lv.{m.citizen.level}</span>
                    </div>
                    <div className="mt-0.5">
                      <Badge color={m.rank === "COMMANDER" ? "gold" : m.rank === "CAPTAIN" ? "cyan" : "slate"}>
                        {m.rank}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!browsedMu.userMembership && (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Unit vault and battle orders are visible to members only.
              </p>
            )}
          </Panel>
        </div>
      )}

      {tab === "browse" && !(selectedMuId && (loadingBrowsed || browsedMu?.id === selectedMuId)) && (
        <div className="space-y-4">
          {/* SEARCH BAR */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Military Units by division name, country, or commander..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <span className="text-xs text-slate-400 shrink-0 font-bold">
              {filteredMus.length} Units Available
            </span>
          </div>
          <FilterBar count={filteredMus.length}>
            <FilterSelect
              label="country"
              value={muCountry}
              onChange={setMuCountry}
              options={[{ value: "all", label: "all" }, ...muCountries.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <FilterToggle label="recruitment open" checked={openOnly} onChange={setOpenOnly} />
          </FilterBar>

          {/* UNIT CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMus.map((unit) => {
              const isMyCurrentMu = myMu?.id === unit.id;
              const hasCapacity = unit._count.members < unit.slots;

              return (
                <Card
                  key={unit.id}
                  className={cn(
                    "p-5 space-y-3.5 border transition-all",
                    isMyCurrentMu
                      ? "border-emerald-500/50 bg-emerald-950/20"
                      : "border-slate-800 bg-slate-950/70 hover:border-slate-700",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-100 truncate">{unit.name}</h3>
                        <Badge color="emerald">{LEVEL_NAMES[unit.levelIdx] || "Novice"}</Badge>
                      </div>
                      {unit.country && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: unit.country.flagColor || "#3b82f6" }}
                          />
                          <span>{unit.country.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-slate-200">
                        {unit._count.members} / {unit.slots}
                      </span>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Soldiers</p>
                    </div>
                  </div>

                  {unit.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{unit.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                    <div>
                      Commander: <span className="font-bold text-slate-200">{unit.leader?.nickname || "Unknown"}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">
                      +{Math.round(unit.damageBonus * 100)}% Dmg
                    </span>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="pt-1 flex items-stretch gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs shrink-0"
                      title="View public unit details"
                      onClick={() => handleSelectMu(unit.id)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Details
                    </Button>
                    <div className="flex-1 min-w-0">
                    {isMyCurrentMu ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs border-emerald-500/40 text-emerald-300"
                        onClick={() => setTab("my")}
                      >
                        <Shield className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Your Active Unit
                      </Button>
                    ) : myMu ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        className="w-full text-xs opacity-50"
                        title="Leave your current unit before joining another"
                      >
                        Enlisted elsewhere
                      </Button>
                    ) : unit.recruitmentOpen && hasCapacity ? (
                      <Button
                        size="sm"
                        variant="success"
                        className="w-full text-xs"
                        onClick={() => handleJoin(unit.id)}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Enlist in Unit
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => handleApply(unit.id)}
                      >
                        Apply for Enlistment
                      </Button>
                    )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FOUND A UNIT                                                       */}
      {/* ========================================================================= */}
      {tab === "found" && (
        <Panel className="max-w-xl mx-auto p-6 space-y-5 border border-slate-800 bg-slate-950/80 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100">Establish a Military Unit</h2>
              <p className="text-xs text-slate-400">Found your own tactical fighting division and lead citizens into battle.</p>
            </div>
          </div>

          <form onSubmit={handleFoundMu} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Unit Name *
              </label>
              <input
                type="text"
                value={foundName}
                onChange={(e) => setFoundName(e.target.value)}
                placeholder="e.g. 101st Airborne Division"
                maxLength={40}
                required
                className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Motto / Description
              </label>
              <textarea
                value={foundDesc}
                onChange={(e) => setFoundDesc(e.target.value)}
                placeholder="Declare your unit's combat doctrine, recruitment guidelines, and combat objectives..."
                rows={3}
                maxLength={250}
                className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-300">
                <span>Charter Establishment Cost:</span>
                <span className="font-mono font-bold text-amber-400">🪙 50.00 Gold</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Initial Soldier Capacity:</span>
                <span className="font-bold text-slate-100">10 Members (Expandable)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Rank Granted:</span>
                <span className="font-bold text-emerald-400">Commander</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="success"
              disabled={foundBusy || !foundName.trim()}
              className="w-full text-xs font-bold py-2.5 shadow-lg"
            >
              {foundBusy ? "Chartering Unit..." : "Found Military Unit (50 Gold)"}
            </Button>
          </form>
        </Panel>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DISTRIBUTE SUPPLIES TO MEMBERS (Leaders Only)                      */}
      {/* ========================================================================= */}
      {showDistributeModal && currentMu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <Card className="w-full max-w-md p-6 space-y-4 border-slate-800 bg-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                  Distribute Supplies from Armory
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDistributeModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDistributeSupplies} className="space-y-4">
              {/* TARGET RECIPIENT */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <span>Recipient Soldier</span>
                  <label className="flex items-center gap-1.5 text-xs text-emerald-400 cursor-pointer font-semibold lowercase">
                    <input
                      type="checkbox"
                      checked={distToAll}
                      onChange={(e) => setDistToAll(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>distribute to all members ({currentMu.members.length})</span>
                  </label>
                </div>

                {!distToAll ? (
                  <select
                    value={distTargetMemberId}
                    onChange={(e) => setDistTargetMemberId(e.target.value)}
                    required={!distToAll}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose member from unit roster --</option>
                    {currentMu.members.map((m) => (
                      <option key={m.citizenId} value={m.citizenId}>
                        {m.citizen.nickname} (Lv. {m.citizen.level} · {m.rank})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300">
                    Each of the {currentMu.members.length} soldiers in {currentMu.name} will receive the specified quantity!
                  </div>
                )}
              </div>

              {/* PRODUCT SELECTION FROM VAULT */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Item Type
                  </label>
                  <select
                    value={distProduct}
                    onChange={(e) => setDistProduct(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="AMMO">Ammo</option>
                    <option value="FOOD">Food / Rations</option>
                    <option value="ENERGY_DRINK">Energy Drink</option>
                    <option value="TICKET">Moving Ticket</option>
                    <option value="FIRST_AID_KIT">First Aid Kit</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Quality
                  </label>
                  <select
                    value={distQuality}
                    onChange={(e) => setDistQuality(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="1">Q1 (Standard)</option>
                    <option value="2">Q2 (Upgraded)</option>
                    <option value="3">Q3 (Advanced)</option>
                    <option value="4">Q4 (Elite)</option>
                    <option value="5">Q5 (Masterwork)</option>
                  </select>
                </div>
              </div>

              {/* QUANTITY */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <span>Quantity {distToAll ? "Per Member" : "To Transfer"}</span>
                  {/* Current Available stock preview */}
                  <span className="text-slate-400 font-mono">
                    Stock in Armory:{" "}
                    {currentMu.storage.find(
                      (s) => s.product === distProduct && s.quality === distQuality,
                    )?.quantity || 0}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={distQty}
                  onChange={(e) => setDistQty(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDistributeModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="success" disabled={distBusy}>
                  {distBusy ? "Dispatching..." : "Dispatch Supplies"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DEPOSIT SUPPLIES / GOLD INTO VAULT                                 */}
      {/* ========================================================================= */}
      {showDepositModal && currentMu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <Card className="w-full max-w-md p-6 space-y-4 border-slate-800 bg-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                  Donate Supplies to Unit Armory
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDepositSupplies} className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDepositKind("PRODUCT")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg border transition",
                    depositKind === "PRODUCT"
                      ? "bg-emerald-500 text-slate-950 border-emerald-400"
                      : "bg-slate-950 text-slate-400 border-slate-800",
                  )}
                >
                  Weapons & Food
                </button>
                <button
                  type="button"
                  onClick={() => setDepositKind("GOLD")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg border transition",
                    depositKind === "GOLD"
                      ? "bg-amber-500 text-slate-950 border-amber-400"
                      : "bg-slate-950 text-slate-400 border-slate-800",
                  )}
                >
                  Gold Treasury
                </button>
              </div>

              {depositKind === "GOLD" ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Gold Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={depositGold}
                    onChange={(e) => setDepositGold(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                        Item Type
                      </label>
                      <select
                        value={depositProduct}
                        onChange={(e) => setDepositProduct(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="AMMO">Ammo</option>
                        <option value="FOOD">Food / Rations</option>
                        <option value="ENERGY_DRINK">Energy Drink</option>
                        <option value="TICKET">Ticket</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                        Quality
                      </label>
                      <select
                        value={depositQuality}
                        onChange={(e) => setDepositQuality(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="1">Q1</option>
                        <option value="2">Q2</option>
                        <option value="3">Q3</option>
                        <option value="4">Q4</option>
                        <option value="5">Q5</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                      <span>Quantity</span>
                      <span className="text-slate-400 font-mono">
                        Your Inventory:{" "}
                        {userStorage?.find(
                          (s) => s.product === depositProduct && s.quality === depositQuality,
                        )?.quantity || 0}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={depositQty}
                      onChange={(e) => setDepositQty(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDepositModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="success" disabled={depositBusy}>
                  {depositBusy ? "Depositing..." : "Deposit to Vault"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
