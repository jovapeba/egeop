"use client";

import { useState } from "react";
import { User, ThumbsUp, ThumbsDown, Users, Package, Settings, Send, Plus, MessageSquare, Check, X, Palette } from "lucide-react";
import { useApi, api } from "@/lib/api";
import { Panel, PanelTitle, Badge, Button, Input, Select, Tabs, useToast, formatMoney } from "@/lib/ui";
import { RatingWidget } from "@/components/rating-widget";

interface Settings {
  avatarColor: string;
  guide: string;
  enableTutorial: boolean;
  shortcuts: string[];
}
interface RatingSummary {
  likes: number;
  dislikes: number;
  myVote: boolean | null;
}
interface Person {
  id: string;
  nickname: string;
  avatarColor: string;
  level: number;
}
interface FriendsData {
  friends: Array<{ id: string; citizen: Person }>;
  incoming: Array<{ id: string; from: Person }>;
  outgoing: Array<{ id: string; to: Person }>;
}
interface PmMessage {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
interface Thread {
  partner: string;
  messages: PmMessage[];
}
interface PacksData {
  packs: Record<string, { gold: number; firstAidKits: number; premiumDays: number }>;
  premiumDaysLeft: number;
  firstAidKits: number;
}
interface Me {
  id: string;
  nickname: string;
  level: number;
  strength: number;
  totalDamage: number;
  avatarColor: string;
  militaryRank: { name: string; bonusPct: number };
  citizenshipCountry: { id: string; name: string; code: string; currencyName: string };
  locationRegion: { id: string; name: string };
  gold: number;
  firstAidKits: number;
  premiumDaysLeft: number;
  guide: string;
  enableTutorial: boolean;
  shortcuts: string[];
}

const ROUTES: Array<[string, string]> = [
  ["/dashboard", "Command Deck"], ["/fight", "Battlefield"], ["/mu", "Military Units"], ["/work", "Work & Economy"],
  ["/market", "Market"], ["/monetary", "Monetary Exchange"], ["/companies", "Companies"], ["/equipment", "Equipment"],
  ["/wars", "Map & Wars"], ["/politics", "Politics"], ["/media", "Media"], ["/auctions", "Auctions"],
  ["/contracts", "Contracts"], ["/events", "Tournaments"], ["/achievements", "Achievements"], ["/stats", "Statistics"],
];
const PACK_COLORS: Record<string, string> = { BRONZE: "text-amber-600", SILVER: "text-slate-300", GOLD: "text-yellow-400" };

export default function ProfilePage() {
  const { push } = useToast();
  const [tab, setTab] = useState<"settings" | "social" | "packs">("settings");
  const { data: me, reload: reloadMe } = useApi<Me>("/auth/me");
  const { data: rating, reload: reloadRating } = useApi<RatingSummary>(me ? `/ratings/CITIZEN/${me.id}` : null);
  const { data: friends, reload: reloadFriends } = useApi<FriendsData>("/friends");

  if (!me) {
    return (
      <div className="max-w-6xl mx-auto">
        <Panel className="p-6 text-sm text-slate-500">Loading profile…</Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Panel className="p-5 flex flex-wrap items-center gap-5">
        <div
          className="w-16 h-16 rounded-2xl grid place-items-center text-2xl font-black text-slate-950 shadow-lg shrink-0"
          style={{ backgroundColor: me.avatarColor }}
        >
          {me.nickname.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-100 tracking-wide flex items-center gap-2">
            {me.nickname}
            <Badge color="emerald">L{me.level}</Badge>
            <Badge color="gold">{me.militaryRank.name}</Badge>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {me.citizenshipCountry.name} · {me.locationRegion.name} · {me.militaryRank.bonusPct}% damage bonus
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Badge color="slate">
            <ThumbsUp size={11} className="text-emerald-400" /> {rating?.likes ?? 0}
          </Badge>
          <Badge color="slate">
            <ThumbsDown size={11} className="text-rose-400" /> {rating?.dislikes ?? 0}
          </Badge>
        </div>
      </Panel>

      <Tabs
        tabs={[
          { id: "settings", label: "Settings" },
          { id: "social", label: "Friends & Mail" },
          { id: "packs", label: "Packs" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "settings" && <SettingsTab me={me} onSaved={() => { reloadMe(); push("Settings saved", "success"); }} />}
      {tab === "social" && <SocialTab me={me} friends={friends} reloadFriends={reloadFriends} push={push} />}
      {tab === "packs" && <PacksTab me={me} onBought={() => { reloadMe(); push("Pack purchased — enjoy!", "success"); }} />}
    </div>
  );
}

function SettingsTab({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [guide, setGuide] = useState(me.guide ?? "MAN");
  const [enableTutorial, setEnableTutorial] = useState(me.enableTutorial ?? true);
  const [shortcuts, setShortcuts] = useState<string[]>(me.shortcuts ?? []);
  const [busy, setBusy] = useState(false);

  const toggleShortcut = (href: string) =>
    setShortcuts((s) => (s.includes(href) ? s.filter((x) => x !== href) : s.length >= 5 ? s : [...s, href]));

  const save = async () => {
    setBusy(true);
    try {
      await api("/citizens/me/settings", {
        method: "PATCH",
        body: { avatarColor, guide, enableTutorial, shortcuts },
      });
      try {
        localStorage.setItem("nf_shortcuts", JSON.stringify(shortcuts)); // sidebar reads this on load
      } catch { /* private mode */ }
      onSaved();
    } catch (e) {
      onSaved(); // still refreshes; toast shows the error below
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel>
        <PanelTitle icon={<Settings size={13} className="text-emerald-400" />}>Profile Settings</PanelTitle>
        <div className="p-4 space-y-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-300 flex items-center gap-2"><Palette size={14} className="text-sky-400" /> Avatar color</span>
            <input type="color" value={avatarColor} onChange={(e) => setAvatarColor(e.target.value)} className="w-14 h-9 rounded-lg bg-transparent" />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Tutorial guide</span>
            <Select value={guide} onChange={(e) => setGuide(e.target.value)}>
              <option value="MAN">Man</option>
              <option value="WOMAN">Woman</option>
              <option value="CHICKEN">Chicken</option>
            </Select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Show tutorial hints</span>
            <input type="checkbox" checked={enableTutorial} onChange={(e) => setEnableTutorial(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
          </label>
          <Button onClick={save} disabled={busy} className="w-full">{busy ? "Saving…" : "Save settings"}</Button>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<Plus size={13} className="text-emerald-400" />} right={<Badge color="slate">{shortcuts.length}/5</Badge>}>
          Sidebar Hotlist — pick up to 5 shortcuts
        </PanelTitle>
        <div className="p-4 grid grid-cols-2 gap-1.5">
          {ROUTES.map(([href, label]) => {
            const on = shortcuts.includes(href);
            return (
              <button
                key={href}
                onClick={() => toggleShortcut(href)}
                className={`rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition border ${
                  on ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function SocialTab({
  me,
  friends,
  reloadFriends,
  push,
}: {
  me: Me;
  friends?: FriendsData | null;
  reloadFriends: () => void;
  push: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}) {
  const [nickname, setNickname] = useState("");
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addFriend = async () => {
    setBusy(true);
    try {
      await api("/friends", { method: "POST", body: { nickname } });
      push(`Request sent to ${nickname}`, "success");
      setNickname("");
      reloadFriends();
    } catch (e) {
      push(e instanceof Error ? e.message : "Request failed", "error");
    } finally {
      setBusy(false);
    }
  };
  const accept = async (id: string) => {
    await api(`/friends/${id}/accept`, { method: "POST" });
    reloadFriends();
  };
  const remove = async (id: string) => {
    await api(`/friends/${id}`, { method: "DELETE" });
    if (thread) setThread(null);
    reloadFriends();
  };
  const openThread = async (p: Person) => {
    const t = await api<Thread>(`/friends/pm/${p.nickname}`);
    setThread(t);
  };
  const send = async () => {
    if (!thread || !draft.trim()) return;
    await api(`/friends/pm/${thread.partner}`, { method: "POST", body: { body: draft } });
    setDraft("");
    const t = await api<Thread>(`/friends/pm/${thread.partner}`);
    setThread(t);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel>
        <PanelTitle icon={<Users size={13} className="text-emerald-400" />} right={<Badge color="slate">{friends?.friends.length ?? 0}</Badge>}>
          Friends (eSocialis)
        </PanelTitle>
        <div className="p-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <Input placeholder="friend's nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} className="flex-1" />
            <Button onClick={addFriend} disabled={busy || !nickname.trim()}>Add</Button>
          </div>
          {friends?.incoming.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
              <span className="text-amber-200 font-semibold">{r.from.nickname} <span className="text-amber-400/70 font-normal">wants to be friends</span></span>
              <span className="flex gap-1">
                <Button size="sm" variant="success" onClick={() => accept(r.id)}><Check size={11} /></Button>
                <Button size="sm" variant="danger" onClick={() => remove(r.id)}><X size={11} /></Button>
              </span>
            </div>
          ))}
          {friends?.friends.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-md grid place-items-center text-[10px] font-black text-slate-950 shrink-0" style={{ backgroundColor: f.citizen.avatarColor }}>
                  {f.citizen.nickname.charAt(0).toUpperCase()}
                </span>
                <span className="text-slate-200 font-semibold truncate">{f.citizen.nickname}</span>
                <Badge color="slate">L{f.citizen.level}</Badge>
              </span>
              <span className="flex gap-1 shrink-0">
                <RatingWidget targetType="CITIZEN" targetId={f.citizen.id} />
                <Button size="sm" variant="outline" onClick={() => openThread(f.citizen)} title="Open mail"><MessageSquare size={11} /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(f.id)} title="Remove"><X size={11} className="text-rose-400" /></Button>
              </span>
            </div>
          ))}
          {friends?.outgoing.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-950/50 border border-slate-800/60 px-3 py-2 text-xs text-slate-500">
              <span>request sent to <b className="text-slate-300">{r.to.nickname}</b></span>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><X size={11} /></Button>
            </div>
          ))}
          {friends && friends.friends.length + friends.incoming.length + friends.outgoing.length === 0 && (
            <p className="text-xs text-slate-500">No friends yet — add citizens by nickname.</p>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<Send size={13} className="text-emerald-400" />} right={thread ? <Badge color="emerald">{thread.partner}</Badge> : undefined}>
          Private Mail
        </PanelTitle>
        <div className="p-4 text-sm">
          {!thread && <p className="text-xs text-slate-500">Select a friend’s mail icon to read and reply.</p>}
          {thread && (
            <div className="space-y-3">
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {thread.messages.map((m) => (
                  <div key={m.id} className={`rounded-lg px-3 py-2 max-w-[85%] ${m.senderId === me.id ? "ml-auto bg-emerald-600/20 border border-emerald-500/30" : "bg-slate-950/70 border border-slate-800"}`}>
                    <p className="text-slate-200 break-words">{m.body}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{new Date(m.createdAt).toLocaleString()}{m.senderId === me.id ? (m.readAt ? " · read" : " · delivered") : ""}</p>
                  </div>
                ))}
                {thread.messages.length === 0 && <p className="text-xs text-slate-500">No messages yet — say hi!</p>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="write a message…" value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && send()} />
                <Button onClick={send} disabled={!draft.trim()}><Send size={12} /></Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function PacksTab({ me, onBought }: { me: Me; onBought: () => void }) {
  const { data: packs, reload } = useApi<PacksData>("/citizens/me/packs");
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (key: string) => {
    setBusy(key);
    try {
      await api(`/citizens/me/packs/${key}`, { method: "POST" });
      onBought();
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel>
      <PanelTitle icon={<Package size={13} className="text-emerald-400" />} right={<Badge color="gold">{formatMoney(me.gold)}g · {me.premiumDaysLeft ?? 0} premium days</Badge>}>
        Premium Packs — simulated gateway
      </PanelTitle>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(packs?.packs ?? {}).map(([key, p]) => (
          <div key={key} className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 space-y-2 text-sm">
            <p className={`font-black tracking-wide ${PACK_COLORS[key] ?? "text-slate-200"}`}>{key}</p>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>+{p.gold} gold</li>
              <li>+{p.firstAidKits} first-aid kits</li>
              <li>+{p.premiumDays} premium days</li>
            </ul>
            <Button size="sm" className="w-full" onClick={() => buy(key)} disabled={busy !== null}>
              {busy === key ? "Processing…" : "Buy pack"}
            </Button>
          </div>
        ))}
      </div>
      <p className="px-4 pb-4 text-[11px] text-slate-500">Premium halves buff debuff durations (24h instead of 48h).</p>
    </Panel>
  );
}
