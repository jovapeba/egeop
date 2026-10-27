"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { cn, useToast } from "@/lib/ui";

/**
 * Like/Dislike widget (wiki: Like/Dislike rating for citizens, stock companies
 * and news portals — voting is gated to Level 13+ server-side).
 */
export function RatingWidget({
  targetType,
  targetId,
}: {
  targetType: "CITIZEN" | "STOCK_COMPANY" | "NEWS_PORTAL";
  targetId: string;
}) {
  const { push } = useToast();
  const { data, reload } = useApi<{ likes: number; dislikes: number; myVote: boolean | null }>(
    `/ratings/${targetType}/${targetId}`,
  );
  const [busy, setBusy] = useState(false);

  const vote = async (isLike: boolean) => {
    setBusy(true);
    try {
      await api("/ratings", { method: "POST", body: { targetType, targetId, isLike } });
      reload();
    } catch (e) {
      push((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const btn = (isLike: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition disabled:opacity-50",
      data?.myVote === isLike
        ? isLike
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : "border-rose-500/50 bg-rose-500/15 text-rose-300"
        : "border-slate-700/70 bg-slate-950/60 text-slate-400 hover:text-slate-200",
    );

  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={() => vote(true)} disabled={busy} className={btn(true)} title="Like">
        <ThumbsUp size={10} /> {data?.likes ?? 0}
      </button>
      <button onClick={() => vote(false)} disabled={busy} className={btn(false)} title="Dislike">
        <ThumbsDown size={10} /> {data?.dislikes ?? 0}
      </button>
    </span>
  );
}
