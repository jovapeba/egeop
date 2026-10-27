"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Coins, Flag, Sparkles } from "lucide-react";
import { api, setToken, getToken, onAuthChange } from "@/lib/api";
import { Button, Card, Input, Tabs, cn } from "@/lib/ui";

interface CountryOption {
  id: string;
  name: string;
  code: string;
  flagColor: string;
  currencyName: string;
  currencySymbol: string;
  _count: {
    citizens: number;
    regions: number;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [referral, setReferral] = useState("");
  const [isSharedIp, setIsSharedIp] = useState(false);
  const [sharedNickname, setSharedNickname] = useState("");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [countrySearch, setCountrySearch] = useState("");
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
      return;
    }
    const unsub = onAuthChange((token) => {
      if (token) {
        router.replace("/dashboard");
      }
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    let active = true;
    setLoadingCountries(true);
    api<CountryOption[]>("/auth/countries")
      .then((data) => {
        if (!active) return;
        setCountries(data);
        if (data.length > 0) {
          setSelectedCountryId((curr) => curr || data[0].id);
        }
      })
      .catch(() => {
        // Fail gracefully
      })
      .finally(() => {
        if (active) setLoadingCountries(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedCountry = countries.find((c) => c.id === selectedCountryId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "register" && !selectedCountryId && countries.length > 0) {
        throw new Error("Please select your citizenship nation");
      }
      const res = await api<{ accessToken: string }>(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body:
          mode === "login"
            ? { email, password }
            : {
                email,
                password,
                nickname,
                countryId: selectedCountryId || undefined,
                referralCode: isSharedIp ? undefined : (referral || undefined),
                sharedIpNickname: isSharedIp ? (sharedNickname || undefined) : undefined,
              },
      });
      setToken(res.accessToken);
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex flex-col items-center">
        <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 border border-cyan-500/30 shadow-[0_0_30px_rgba(56,189,248,0.35)]">
          <Image
            src="/logo.png"
            alt="eGEOPOLIS Logo"
            width={80}
            height={80}
            className="h-16 w-16 object-contain"
            priority
          />
        </div>
        <h1 className="text-center text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
          eGEOPOLIS
        </h1>
        <p className="mt-1 text-[11px] font-bold tracking-widest text-slate-400 uppercase">
          Strategy • Nations • Power
        </p>
      </div>
      <Card className="border-slate-800/90 bg-slate-900/90 shadow-2xl backdrop-blur-xl">
        <Tabs
          tabs={[
            { id: "login", label: "Sign in" },
            { id: "register", label: "New citizen" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <div className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Email
            </label>
            <Input
              placeholder="citizen@egeopolis.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <Input
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
          </div>

          {mode === "register" && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Citizen Nickname
                </label>
                <Input
                  placeholder="Commander (3–20 chars)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>

              {/* Citizenship Selector */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Flag className="h-3.5 w-3.5 text-emerald-400" />
                    Choose Citizenship
                  </label>
                  {selectedCountry && (
                    <span className="flex items-center gap-1 rounded bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-800/50">
                      <Coins className="h-3 w-3" />
                      500 {selectedCountry.currencySymbol} bonus
                    </span>
                  )}
                </div>

                {/* Search filter for 221 countries */}
                <div className="relative">
                  <Input
                    placeholder="Search 220+ real countries (e.g. Poland, USA, Japan)..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                {loadingCountries && countries.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-500 animate-pulse">
                    Loading available nations...
                  </div>
                ) : (
                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {countries
                      .filter((c) => {
                        const q = countrySearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          c.name.toLowerCase().includes(q) ||
                          c.code.toLowerCase().includes(q)
                        );
                      })
                      .map((c) => {
                      const isSelected = selectedCountryId === c.id;
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedCountryId(c.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
                            isSelected
                              ? "border-emerald-500/80 bg-emerald-950/25 ring-1 ring-emerald-500/40"
                              : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-800/40",
                          )}
                        >
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white shadow"
                            style={{ backgroundColor: c.flagColor }}
                          >
                            {c.code}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="truncate text-xs font-bold text-slate-200">
                                {c.name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {c.currencySymbol} {c.currencyName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span>{c._count.citizens} citizens</span>
                              <span>•</span>
                              <span>{c._count.regions} regions</span>
                            </div>
                          </div>
                          {isSelected ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <div className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCountry && (
                  <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-2 text-[11px] text-slate-400 flex items-start gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      You will spawn in the capital of{" "}
                      <strong className="text-slate-200">{selectedCountry.name}</strong> with{" "}
                      <strong className="text-emerald-400">
                        500 {selectedCountry.currencySymbol} ({selectedCountry.currencyName})
                      </strong>{" "}
                      starter fiat in your personal wallet.
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={isSharedIp}
                    onChange={(e) => {
                      setIsSharedIp(e.target.checked);
                      if (e.target.checked) setReferral("");
                    }}
                    className="rounded border-slate-700 bg-slate-800 text-emerald-500"
                  />
                  <span>Shared IP registration (registering 2nd account on this IP)</span>
                </label>

                {isSharedIp ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-amber-400">
                      Second Account Nickname on this IP <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      placeholder="Enter existing account nickname on your IP"
                      value={sharedNickname}
                      onChange={(e) => setSharedNickname(e.target.value)}
                    />
                    <p className="mt-1 text-[10px] text-muted">Limit is 2 accounts per IP. Shared IP accounts are public and excluded from referral bonuses.</p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Referral Code <span className="text-slate-600">(Optional)</span>
                    </label>
                    <Input
                      placeholder="Invite / Referral code"
                      value={referral}
                      onChange={(e) => setReferral(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {error && <p className="text-xs font-semibold text-rose-400">{error}</p>}

          <Button className="w-full text-xs font-bold" onClick={submit} disabled={busy}>
            {busy
              ? "Processing…"
              : mode === "login"
                ? "Sign in"
                : selectedCountry
                  ? `Become Citizen of ${selectedCountry.name}`
                  : "Create citizen"}
          </Button>

          {mode === "login" && (
            <p className="text-center text-xs text-slate-500">
              Demo: <code className="text-slate-400">demo1@egeopolis.dev</code> / <code className="text-slate-400">demo1234</code>
            </p>
          )}
        </div>
      </Card>
    </main>
  );
}
