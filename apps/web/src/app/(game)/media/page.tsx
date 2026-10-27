"use client";

import { useState } from "react";
import {
  Newspaper as NewspaperIcon,
  MessageSquare,
  ThumbsUp,
  HeartHandshake,
  Megaphone,
  Radio,
  Sparkles,
  Globe,
  Flag,
  User,
  PlusCircle,
  BellRing,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api, useApi } from "@/lib/api";
import {
  Badge,
  Button,
  Input,
  Panel,
  Tabs,
  useToast,
  useWallet,
  cn,
  formatMoney,
} from "@/lib/ui";
import { WysiwygEditor } from "./wysiwyg-editor";
import { RatingWidget } from "@/components/rating-widget";

interface Article {
  id: string;
  title: string;
  body: string;
  scope: string;
  upvotes: number;
  createdAt: string;
  newspaper: { id: string; name: string; avatarColor: string };
  author: { id: string; nickname: string };
  votes?: Array<{ citizenId: string }>;
}

interface Shout {
  id: string;
  content: string;
  createdAt: string;
  author: { nickname: string; citizenshipCountry?: { code: string } };
}

interface MyNewspaper {
  id: string;
  name: string;
  avatarColor: string;
  _count: { subscribers: number; articles: number };
}

interface CitizenMe {
  id: string;
  nickname: string;
  level: number;
  gold: number;
  citizenshipCountry: { id: string; name: string; code: string };
}

const AVATAR_COLORS = ["#e8b44a", "#4a7de8", "#4cc38a", "#c9543f", "#8b5cf6", "#06b6d4"];

export default function MediaPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"articles" | "publish" | "shouts" | "portals">("articles");
  const [filterScope, setFilterScope] = useState<"ALL" | "GLOBAL" | "COUNTRY">("ALL");

  const { data: me, reload: reloadMe } = useApi<CitizenMe>("/auth/me");
  const { data: articles, reload: reloadArticles } = useApi<Article[]>("/media/articles");
  const { data: paper, reload: reloadPaper } = useApi<MyNewspaper | null>("/media/portal");
  const { data: shouts, reload: reloadShouts } = useApi<Shout[]>("/media/shouts?take=40");

  const [npName, setNpName] = useState("");
  const [npColor, setNpColor] = useState("#e8b44a");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"GLOBAL" | "COUNTRY">("GLOBAL");
  const [shout, setShout] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({});

  async function handleCreateNewspaper() {
    if (!npName.trim() || npName.trim().length < 3) {
      push("Newspaper name must be at least 3 characters", "warning");
      return;
    }
    if (me && me.gold < 2000) {
      push(`You need 20 Gold to create a newspaper (current balance: ${formatMoney(me.gold)}g)`, "error");
      return;
    }
    setBusy(true);
    try {
      await api("/media/portal", {
        method: "POST",
        body: { name: npName.trim(), avatarColor: npColor },
      });
      push("Newspaper successfully established! You can now publish articles.", "success");
      setNpName("");
      reloadPaper();
      reloadMe();
      refresh();
      setTab("publish");
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishArticle() {
    if (!title.trim()) {
      push("Please enter a headline for your article", "warning");
      return;
    }
    if (!body.trim() || body === "<p></p>" || body === "<p><br></p>") {
      push("Article body cannot be empty", "warning");
      return;
    }
    setBusy(true);
    try {
      const scopeValue = scope === "GLOBAL" ? "GLOBAL" : (me?.citizenshipCountry.code ?? "COUNTRY");
      await api("/media/articles", {
        method: "POST",
        body: { title: title.trim(), body, scope: scopeValue },
      });
      push("Article published successfully!", "success");
      setTitle("");
      setBody("");
      reloadArticles();
      reloadPaper();
      setTab("articles");
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpvote(id: string) {
    try {
      await api(`/media/articles/${id}/upvote`, { method: "POST" });
      push("Upvoted article!", "success");
      reloadArticles();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  async function handleTip(id: string) {
    if (me && me.gold < 100) {
      push("Not enough gold to tip 1g", "warning");
      return;
    }
    try {
      await api(`/media/articles/${id}/tip`, { method: "POST", body: { gold: 1 } });
      push("Tipped author 1g!", "success");
      reloadArticles();
      reloadMe();
      refresh();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  async function handleSubscribe(newspaperId: string) {
    try {
      await api(`/media/portals/${newspaperId}/subscribe`, { method: "POST" });
      push("Subscribed to newspaper!", "success");
      reloadArticles();
      reloadPaper();
    } catch (e) {
      push((e as Error).message, "error");
    }
  }

  async function handlePostShout() {
    if (!shout.trim()) return;
    setBusy(true);
    try {
      await api("/media/shouts", { method: "POST", body: { scope: "GLOBAL", content: shout.trim() } });
      push("Shouted to the world!", "success");
      setShout("");
      reloadShouts();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedArticles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredArticles = (articles ?? []).filter((a) => {
    if (filterScope === "GLOBAL") return a.scope === "GLOBAL";
    if (filterScope === "COUNTRY") return a.scope !== "GLOBAL";
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* HEADER BANNER */}
      <Panel className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1">
            <Radio className="w-4 h-4 animate-pulse" /> Free Press & Media Bureau
          </div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            National & Global Press
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Publish editorials, break tactical frontline news, and voice your thoughts to the world.
          </p>
        </div>

        {/* NEWSPAPER STATUS / CREATION BADGE */}
        {paper ? (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center gap-3 shadow-lg">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base text-slate-950 shadow-md shrink-0"
              style={{ background: paper.avatarColor || "#e8b44a" }}
            >
              📰
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Your Newspaper</div>
              <h3 className="font-bold text-slate-200 text-sm">{paper.name}</h3>
              <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                {paper._count.subscribers} subscribers • {paper._count.articles} articles
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30 text-amber-400">
              <NewspaperIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">Start Your Newspaper</div>
              <div className="text-[11px] text-slate-400">
                Found a press agency for <strong className="text-amber-300">20 Gold</strong> (L4+)
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* MAIN CONTAINER */}
      <Panel className="p-5 space-y-5">
        <Tabs
          tabs={[
            { id: "articles", label: "Articles Feed" },
            { id: "publish", label: "Write Article" },
            { id: "shouts", label: "Live Shouts" },
            { id: "portals", label: "News Portals" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* TAB 1: ARTICLES FEED */}
        {tab === "articles" && (
          <div className="space-y-4">
            {/* Scope Filter Pills */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterScope("ALL")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition",
                    filterScope === "ALL"
                      ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white",
                  )}
                >
                  All ({articles?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope("GLOBAL")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1",
                    filterScope === "GLOBAL"
                      ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white",
                  )}
                >
                  <Globe className="w-3 h-3" /> Global
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope("COUNTRY")}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1",
                    filterScope === "COUNTRY"
                      ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white",
                  )}
                >
                  <Flag className="w-3 h-3" /> National
                </button>
              </div>

              {!paper && (
                <button
                  type="button"
                  onClick={() => setTab("publish")}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Found a Newspaper (20g) to Publish
                </button>
              )}
            </div>

            {/* Articles List */}
            <div className="space-y-4">
              {filteredArticles.map((a) => {
                const isExpanded = expandedArticles[a.id] ?? true;
                return (
                  <article
                    key={a.id}
                    className="rounded-2xl border border-slate-800/90 bg-slate-950/90 p-5 space-y-4 shadow-xl transition hover:border-slate-700/80"
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-slate-950 shadow"
                          style={{ background: a.newspaper.avatarColor || "#e8b44a" }}
                        >
                          📰
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200 text-xs">
                              {a.newspaper.name}
                            </span>
                            <Badge color={a.scope === "GLOBAL" ? "cyan" : "emerald"}>
                              {a.scope === "GLOBAL" ? "GLOBAL" : a.scope}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>By <strong className="text-slate-300">{a.author.nickname}</strong></span>
                            <span>•</span>
                            <span>{new Date(a.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSubscribe(a.newspaper.id)}
                        className="text-[11px] text-slate-400 hover:text-cyan-400"
                        title="Subscribe to this newspaper"
                      >
                        <BellRing className="w-3 h-3" /> Subscribe
                      </Button>
                    </div>

                    {/* Article Title */}
                    <h2
                      onClick={() => toggleExpand(a.id)}
                      className="text-lg font-black text-slate-100 hover:text-emerald-300 transition cursor-pointer"
                    >
                      {a.title}
                    </h2>

                    {/* Formatted Article Body */}
                    {isExpanded && (
                      <div
                        className={cn(
                          "pt-2 pb-3 text-slate-200 text-sm leading-relaxed border-t border-slate-900",
                          "[&>h1]:text-2xl [&>h1]:font-black [&>h1]:text-slate-100 [&>h1]:my-3",
                          "[&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-100 [&>h2]:my-2",
                          "[&>h3]:text-base [&>h3]:font-bold [&>h3]:text-emerald-400 [&>h3]:my-2",
                          "[&>p]:mb-3 [&>p]:leading-relaxed",
                          "[&>blockquote]:border-l-4 [&>blockquote]:border-emerald-500/70 [&>blockquote]:pl-4 [&>blockquote]:py-1.5 [&>blockquote]:italic [&>blockquote]:text-slate-300 [&>blockquote]:my-3 [&>blockquote]:bg-slate-900/50 [&>blockquote]:rounded-r-lg",
                          "[&>ul]:list-disc [&>ul]:list-inside [&>ul]:mb-3 [&>ul]:space-y-1",
                          "[&>ol]:list-decimal [&>ol]:list-inside [&>ol]:mb-3 [&>ol]:space-y-1",
                          "[&>hr]:border-slate-800 [&>hr]:my-4",
                          "[&>a]:text-cyan-400 [&>a]:underline hover:[&>a]:text-cyan-300",
                          "[&>img]:rounded-xl [&>img]:border [&>img]:border-slate-800 [&>img]:max-w-full [&>img]:my-3 [&>img]:shadow-xl",
                        )}
                        dangerouslySetInnerHTML={{ __html: a.body }}
                      />
                    )}

                    {/* Article Footer & Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                      <button
                        type="button"
                        onClick={() => toggleExpand(a.id)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-semibold"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Read Full Article
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpvote(a.id)}
                          className="hover:text-emerald-300 hover:bg-emerald-950/40 text-xs"
                          title="Vote for article"
                        >
                          <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{a.upvotes}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTip(a.id)}
                          className="hover:text-amber-300 hover:border-amber-500/40 text-xs font-semibold"
                          title="Tip author 1 Gold"
                        >
                          <HeartHandshake className="w-3.5 h-3.5 text-amber-400" />
                          <span>Tip 1g</span>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {filteredArticles.length === 0 && (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl p-6 text-slate-500">
                  <NewspaperIcon className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-sm font-medium text-slate-400">No articles published in this category yet.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Be the first publisher to break the news!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: WRITE ARTICLE (WYSIWYG) */}
        {tab === "publish" && (
          <div className="space-y-5">
            {/* If user does NOT own a newspaper: Show creation form */}
            {!paper ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400 shrink-0">
                    <NewspaperIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-100">
                      Press License Required
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      To publish articles and reach the nation, you must first establish your own newspaper agency.
                      Newspaper foundation costs <strong className="text-amber-300 font-bold">20 Gold</strong> and requires Level 4.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Newspaper Name
                    </label>
                    <Input
                      placeholder="e.g. The Aurelian Tribune, Frontline Chronicle…"
                      value={npName}
                      onChange={(e) => setNpName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Brand / Emblem Color
                    </label>
                    <div className="flex items-center gap-2">
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNpColor(c)}
                          className={cn(
                            "w-7 h-7 rounded-lg border-2 transition-all",
                            npColor === c ? "border-white scale-110 shadow-lg" : "border-transparent opacity-70 hover:opacity-100",
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-slate-400 font-mono">
                      Your balance: <strong className="text-amber-300">{formatMoney(me?.gold)}g</strong> / 20.00g required
                    </div>
                    <Button
                      onClick={handleCreateNewspaper}
                      disabled={busy || !npName.trim() || (me ? me.gold < 2000 : false)}
                      className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black shadow-lg"
                    >
                      <PlusCircle className="w-4 h-4" /> Found Newspaper (20g)
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* If user DOES own a newspaper: WYSIWYG article composer */
              <div className="space-y-4">
                {/* Active Newspaper Info & Scope */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                      style={{ background: paper.avatarColor || "#e8b44a" }}
                    >
                      📰
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">Publishing Under</span>
                      <span className="text-xs font-bold text-slate-200">{paper.name}</span>
                    </div>
                  </div>

                  {/* Scope Selector */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setScope("GLOBAL")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                        scope === "GLOBAL"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "text-slate-400 hover:text-white",
                      )}
                    >
                      <Globe className="w-3.5 h-3.5" /> Global Edition
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("COUNTRY")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                        scope === "COUNTRY"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "text-slate-400 hover:text-white",
                      )}
                    >
                      <Flag className="w-3.5 h-3.5" /> National ({me?.citizenshipCountry.code ?? "Local"})
                    </button>
                  </div>
                </div>

                {/* Article Headline */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Article Headline
                  </label>
                  <Input
                    placeholder="Enter an eye-catching headline…"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-base font-bold text-slate-100 placeholder:text-slate-600 h-10"
                    maxLength={200}
                  />
                </div>

                {/* WYSIWYG Editor */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Article Content (WYSIWYG Editor)
                  </label>
                  <WysiwygEditor
                    value={body}
                    onChange={setBody}
                    placeholder="Write your story here… Use headings, quotes, bold, links, lists, or quick templates above."
                  />
                </div>

                {/* Publish Button */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-500">
                    1 article per hour cooldown (wiki rule) • 5g awarded per 100 subscribers
                  </span>
                  <Button
                    onClick={handlePublishArticle}
                    disabled={busy || !title.trim() || !body.trim()}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black px-6 shadow-lg shadow-emerald-500/20"
                  >
                    <Megaphone className="w-4 h-4" /> Publish Article
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: NEWS PORTALS — public directory with Like/Dislike rating (wiki) */}
        {tab === "portals" && <PortalsTab />}

        {/* TAB 3: LIVE SHOUTS */}
        {tab === "shouts" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Broadcast a brief transmission to all citizens… (max 100 characters)"
                value={shout}
                onChange={(e) => setShout(e.target.value)}
                maxLength={100}
              />
              <Button
                onClick={handlePostShout}
                disabled={busy || !shout.trim()}
                className="shrink-0 font-bold"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Broadcast
              </Button>
            </div>

            <div className="space-y-1.5">
              {(shouts ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-2.5 rounded-xl bg-slate-950/80 border border-slate-800 px-3.5 py-2.5 text-xs text-slate-200"
                >
                  <Badge color="slate" className="shrink-0 mt-0.5 font-mono">
                    {s.author.citizenshipCountry?.code ?? "INT"}
                  </Badge>
                  <strong className="text-slate-300 font-semibold shrink-0">
                    {s.author.nickname}:
                  </strong>
                  <span className="flex-1 break-words">{s.content}</span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {(shouts ?? []).length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">No broadcasts recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// News portals directory + Like/Dislike rating (wiki: portal ratings)
// ---------------------------------------------------------------------------
interface PortalRow {
  id: string;
  name: string;
  avatarColor: string;
  totalViews: number;
  owner: { nickname: string };
  _count: { subscribers: number; articles: number };
}

function PortalsTab() {
  const { data: portals } = useApi<PortalRow[]>("/media/portals");
  const { push } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api("/media/portal", { method: "POST", body: { name } });
      push("Portal founded!", "success");
      setName("");
      window.location.reload(); // refreshes the directory + my-portal header
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <p className="mb-1 text-xs text-slate-400">
            Found your own news portal — Level 13+, 50g. Earn 1g per 100 article views.
          </p>
          <Input className="w-64" placeholder="Portal name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={create} disabled={busy || !name.trim()} className="shrink-0 font-bold">
          <PlusCircle size={14} /> found portal
        </Button>
      </div>

      <div className="space-y-1.5">
        {(portals ?? []).map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/80 border border-slate-800 px-3.5 py-2.5 text-sm"
          >
            <span
              className="w-7 h-7 rounded-md grid place-items-center text-[11px] font-black text-slate-950 shrink-0"
              style={{ backgroundColor: p.avatarColor }}
            >
              {p.name.charAt(0).toUpperCase()}
            </span>
            <span className="font-bold text-slate-100">{p.name}</span>
            <Badge color="slate">by {p.owner.nickname}</Badge>
            <Badge color="cyan">{p._count.articles} articles</Badge>
            <Badge color="purple">{p._count.subscribers} subscribers</Badge>
            <Badge color="gold">{p.totalViews.toLocaleString()} views</Badge>
            <span className="ml-auto shrink-0">
              <RatingWidget targetType="NEWS_PORTAL" targetId={p.id} />
            </span>
          </div>
        ))}
        {(portals ?? []).length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">No news portals founded yet.</p>
        )}
      </div>
    </div>
  );
}
