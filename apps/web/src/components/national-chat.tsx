"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  X,
  Send,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Minimize2,
  Maximize2,
  RefreshCw,
  Lock,
  Globe2,
} from "lucide-react";
import { api, getToken } from "@/lib/api";
import { chatSocket, type CountryChatMessage } from "@/lib/socket";
import { cn } from "@/lib/ui";

interface CitizenCountry {
  id: string;
  name: string;
  code: string;
  flagColor?: string;
}

interface NationalChatProps {
  myCitizenshipCountry?: CitizenCountry | null;
  myCitizenId?: string;
  myNickname?: string;
}

export function NationalChat({
  myCitizenshipCountry,
  myCitizenId,
  myNickname,
}: NationalChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<CountryChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  // Active channel country: default to user's citizenship
  const [selectedCountry, setSelectedCountry] = useState<CitizenCountry | null>(
    myCitizenshipCountry ?? null,
  );
  const [allCountries, setAllCountries] = useState<CitizenCountry[]>([]);
  const [showChannelPicker, setShowChannelPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep selected country in sync when user's citizenship loads
  useEffect(() => {
    if (myCitizenshipCountry && (!selectedCountry || selectedCountry.id === myCitizenshipCountry.id)) {
      setSelectedCountry(myCitizenshipCountry);
    }
  }, [myCitizenshipCountry]);

  // Load country list for channel switching demo
  useEffect(() => {
    api<CitizenCountry[]>("/auth/countries")
      .then((list) => {
        if (Array.isArray(list)) {
          setAllCountries(list);
        }
      })
      .catch(() => undefined);
  }, []);

  const currentCountryId = selectedCountry?.id ?? myCitizenshipCountry?.id;
  const isMyCountry = Boolean(
    myCitizenshipCountry?.id && currentCountryId === myCitizenshipCountry.id,
  );

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch message history when channel changes or chat opens
  const fetchHistory = async (countryId: string) => {
    setLoading(true);
    setAccessDeniedMessage(null);
    try {
      const data = await api<CountryChatMessage[]>(`/chat/country/${countryId}`);
      if (Array.isArray(data)) {
        setMessages(data);
        setTimeout(scrollToBottom, 80);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to load messages";
      if (
        msg.includes("Access denied") ||
        msg.includes("Forbidden") ||
        msg.includes("403") ||
        msg.includes("citizenship")
      ) {
        setAccessDeniedMessage(
          "ACCESS DENIED: Inaccessible frequency. This channel is strictly encrypted for verified citizens of this nation only.",
        );
      } else {
        setAccessDeniedMessage(msg);
      }
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentCountryId) return;

    if (!isMyCountry) {
      setAccessDeniedMessage(
        `ACCESS DENIED: Frequency Encrypted. You hold citizenship of ${
          myCitizenshipCountry?.name || "another country"
        }. In accordance with National Security Protocols, this channel is strictly inaccessible to foreign citizens.`,
      );
      setMessages([]);
      return;
    }

    fetchHistory(currentCountryId);
  }, [currentCountryId, isMyCountry, myCitizenshipCountry?.name]);

  // Socket.io connection & realtime event listener
  useEffect(() => {
    if (!currentCountryId || !isMyCountry) return;

    const token = getToken();
    const socket = chatSocket(token);

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      setSocketConnected(true);
      socket.emit("chat:join", { countryId: currentCountryId, token });
    };

    const onDisconnect = () => {
      setSocketConnected(false);
    };

    const onChatMessage = (msg: CountryChatMessage) => {
      if (msg && msg.countryId === currentCountryId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (!isOpen) {
          setUnreadCount((c) => c + 1);
        } else {
          setTimeout(scrollToBottom, 60);
        }
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:message", onChatMessage);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.emit("chat:leave", { countryId: currentCountryId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:message", onChatMessage);
    };
  }, [currentCountryId, isMyCountry, isOpen]);

  // Clear unread on open
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(scrollToBottom, 100);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || sending || !currentCountryId || !isMyCountry) return;

    setSending(true);
    try {
      const token = getToken();
      const socket = chatSocket(token);

      // Send via socket with REST fallback
      let sentSuccessfully = false;
      if (socket.connected) {
        sentSuccessfully = await new Promise<boolean>((resolve) => {
          socket.emit(
            "chat:send",
            { countryId: currentCountryId, content: text, token },
            (res: { ok: boolean; message?: CountryChatMessage; error?: string }) => {
              if (res?.ok && res.message) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === res.message!.id)) return prev;
                  return [...prev, res.message!];
                });
                resolve(true);
              } else {
                resolve(false);
              }
            },
          );
          // Timeout socket acknowledgment after 1.5s
          setTimeout(() => resolve(false), 1500);
        });
      }

      if (!sentSuccessfully) {
        const fallbackMsg = await api<CountryChatMessage>(
          `/chat/country/${currentCountryId}`,
          {
            method: "POST",
            body: { content: text },
          },
        );
        setMessages((prev) => {
          if (prev.some((m) => m.id === fallbackMsg.id)) return prev;
          return [...prev, fallbackMsg];
        });
      }

      setInputText("");
      setTimeout(scrollToBottom, 50);
    } catch (err: any) {
      alert(err.message || "Failed to broadcast message");
    } finally {
      setSending(false);
    }
  };

  const activeCountry = selectedCountry ?? myCitizenshipCountry;

  return (
    <div className="fixed bottom-4 right-4 z-40 font-sans">
      {/* FLOATING LAUNCHER BUTTON (When Closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900/95 hover:bg-slate-800 text-slate-100 border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
          title={`Open ${myCitizenshipCountry?.name || "National"} Comms`}
        >
          {/* Flag indicator dot */}
          <div
            className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm shrink-0"
            style={{ backgroundColor: myCitizenshipCountry?.flagColor || "#3b82f6" }}
          />

          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-wider text-slate-200">
              {myCitizenshipCountry?.code || "NAT"} COMMS
            </span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase font-bold text-emerald-400/90">
                Live
              </span>
            </div>
          </div>

          <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition" />

          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white shadow-lg animate-bounce">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* CHAT WINDOW (When Open) */}
      {isOpen && (
        <div
          className={cn(
            "flex flex-col bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200",
            isExpanded
              ? "w-[94vw] sm:w-[540px] h-[80vh] max-h-[700px]"
              : "w-[94vw] sm:w-[380px] h-[520px] max-h-[85vh]",
          )}
        >
          {/* TOP BAR / HEADER */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-sm"
                style={{ backgroundColor: activeCountry?.flagColor || "#3b82f6" }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-black tracking-wide text-slate-100 truncate">
                    {activeCountry?.name || "National"} Comms
                  </h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                    {activeCountry?.code || "NAT"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {isMyCountry ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-semibold text-emerald-400">
                        {socketConnected ? "CITIZEN FREQUENCY // LIVE" : "CONNECTING..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-2.5 h-2.5 text-rose-400" />
                      <span className="font-semibold text-rose-400">
                        CLASSIFIED // FOREIGN NATION
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* CONTROLS */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Channel Selector Toggle */}
              <button
                type="button"
                onClick={() => setShowChannelPicker((p) => !p)}
                className={cn(
                  "p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition",
                  showChannelPicker && "bg-slate-800 text-emerald-400",
                )}
                title="Switch channel frequency"
              >
                <Globe2 className="w-3.5 h-3.5" />
              </button>

              {/* Refresh History */}
              {isMyCountry && (
                <button
                  type="button"
                  onClick={() => currentCountryId && fetchHistory(currentCountryId)}
                  disabled={loading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
                  title="Reload transmissions"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                </button>
              )}

              {/* Expand / Minimize Toggle */}
              <button
                type="button"
                onClick={() => setIsExpanded((e) => !e)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                title={isExpanded ? "Standard view" : "Enlarge window"}
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Minimize comms deck"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* CHANNEL SELECTOR DROPDOWN */}
          {showChannelPicker && (
            <div className="bg-slate-900 border-b border-slate-800 p-2.5 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Select Frequency Channel</span>
                <span className="text-slate-500">Security Scrambled</span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                {/* User's citizenship country */}
                {myCitizenshipCountry && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCountry(myCitizenshipCountry);
                      setShowChannelPicker(false);
                    }}
                    className={cn(
                      "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left border transition",
                      currentCountryId === myCitizenshipCountry.id
                        ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                        : "bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: myCitizenshipCountry.flagColor || "#10b981" }}
                      />
                      <span>{myCitizenshipCountry.name} (Your Homeland)</span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      AUTHORIZED
                    </span>
                  </button>
                )}

                {/* Other countries (to demonstrate inaccessibility) */}
                {allCountries
                  .filter((c) => c.id !== myCitizenshipCountry?.id)
                  .slice(0, 10)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCountry(c);
                        setShowChannelPicker(false);
                      }}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left border transition",
                        currentCountryId === c.id
                          ? "bg-rose-950/40 border-rose-500/50 text-rose-300"
                          : "bg-slate-800/50 hover:bg-slate-800 border-slate-700/40 text-slate-400",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full opacity-60"
                          style={{ backgroundColor: c.flagColor || "#64748b" }}
                        />
                        <span>{c.name}</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> RESTRICTED
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* SECURITY STATUS BANNER */}
          <div
            className={cn(
              "px-3 py-1.5 text-[10px] font-semibold flex items-center justify-between border-b",
              isMyCountry
                ? "bg-emerald-950/20 text-emerald-300/90 border-emerald-900/30"
                : "bg-rose-950/40 text-rose-300 border-rose-900/40",
            )}
          >
            <div className="flex items-center gap-1.5">
              {isMyCountry ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>SECURE CHANNEL // CITIZENS OF {activeCountry?.name?.toUpperCase()} ONLY</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  <span>FOREIGN TERRITORY // INACCESSIBLE FREQUENCY</span>
                </>
              )}
            </div>
            <span className="font-mono text-[9px] text-slate-400">
              {isMyCountry ? "ENC-256" : "BLOCKED"}
            </span>
          </div>

          {/* MAIN MESSAGE FEED */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 bg-slate-950/50">
            {/* ACCESS DENIED STATE FOR FOREIGN COUNTRIES */}
            {!isMyCountry || accessDeniedMessage ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-rose-950/50 border border-rose-800/60 flex items-center justify-center text-rose-400 shadow-lg">
                  <Lock className="w-7 h-7" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h4 className="text-xs font-black tracking-wider text-rose-400 uppercase">
                    Classified Frequency
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {accessDeniedMessage ||
                      `Transmissions for ${activeCountry?.name} are reserved strictly for its verified citizens. Citizens of other nations are barred from viewing or participating.`}
                  </p>
                </div>
                {myCitizenshipCountry && (
                  <button
                    type="button"
                    onClick={() => setSelectedCountry(myCitizenshipCountry)}
                    className="mt-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition"
                  >
                    Return to {myCitizenshipCountry.name} Comms
                  </button>
                )}
              </div>
            ) : loading && messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                <span>Decrypting national channel...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4 space-y-2">
                <Radio className="w-8 h-8 text-slate-600 stroke-[1.5]" />
                <p className="text-xs font-medium text-slate-400">
                  Channel is silent.
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Be the first citizen of {activeCountry?.name} to broadcast orders, recruit soldiers, or coordinate strategy!
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.authorId === myCitizenId;
                const authorNick = msg.author?.nickname || "Citizen";
                const authorColor = msg.author?.avatarColor || "#64748b";
                const authorLvl = msg.author?.level || 1;
                const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2.5 items-start",
                      isMe ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    {/* Avatar circle */}
                    <div
                      className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: authorColor }}
                      title={`${authorNick} (Lv. ${authorLvl})`}
                    >
                      {authorNick.charAt(0).toUpperCase()}
                    </div>

                    {/* Bubble content */}
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3 py-2 text-xs border shadow-sm space-y-1",
                        isMe
                          ? "bg-emerald-950/50 border-emerald-700/60 text-slate-100 rounded-tr-none"
                          : "bg-slate-900/90 border-slate-800 text-slate-200 rounded-tl-none",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span
                          className={cn(
                            "font-bold truncate max-w-[120px]",
                            isMe ? "text-emerald-300" : "text-cyan-300",
                          )}
                        >
                          {authorNick}
                        </span>
                        <span className="px-1 py-0.2 rounded bg-slate-800 text-[9px] text-slate-300 font-bold border border-slate-700">
                          Lv.{authorLvl}
                        </span>
                        <span className="text-[9px] text-slate-500 ml-auto">{timeStr}</span>
                      </div>

                      <p className="text-[12px] leading-relaxed break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT FORM (Only available if citizen of this country) */}
          {isMyCountry ? (
            <form
              onSubmit={handleSendMessage}
              className="p-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value.slice(0, 500))}
                placeholder={`Broadcast to ${activeCountry?.name || "Homeland"} citizens...`}
                maxLength={500}
                disabled={sending}
                className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-bold transition flex items-center justify-center shrink-0 shadow-md"
                title="Send broadcast"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="p-3 bg-slate-900/90 border-t border-slate-800 text-center">
              <span className="text-[11px] font-semibold text-rose-400 flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Transmission disabled: Foreign citizenship detected
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
