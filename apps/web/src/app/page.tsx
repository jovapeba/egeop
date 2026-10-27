import Link from "next/link";
import Image from "next/image";
import { Swords, Briefcase, Dumbbell, Globe2, Landmark, Newspaper, ShieldCheck, Coins } from "lucide-react";

const features = [
  { icon: Swords, title: "Real-time warfare", text: "2-hour rounds, tug-of-war walls, berserk hits, hero medals and live WebSocket battle feeds." },
  { icon: Briefcase, title: "Working economy", text: "Raw chains → factories → goods. Job market, wages, taxes set by congress." },
  { icon: Dumbbell, title: "Train & grow", text: "Daily training, military ranks from Rookie to Deus, streak medals." },
  { icon: Globe2, title: "Living map", text: "Conquer regions, run resistance wars, build hospitals and defense systems." },
  { icon: Landmark, title: "Full politics", text: "Elect presidents and congress on a 30-day cycle. Propose and vote laws." },
  { icon: Newspaper, title: "Media & society", text: "Newspapers, tips, subscriptions and live shouts — global, country, MU feeds." },
  { icon: ShieldCheck, title: "Race-safe engine", text: "Redis distributed locks + row locks on every critical mutation." },
  { icon: Coins, title: "Financial markets", text: "Product market with VAT/import, monetary FX market, JSC stock exchange." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 border border-cyan-500/30 shadow-[0_0_25px_rgba(56,189,248,0.3)]">
          <Image
            src="/logo.png"
            alt="eGEOPOLIS Logo"
            width={64}
            height={64}
            className="h-14 w-14 object-contain"
            priority
          />
        </div>
        <div>
          <span className="text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 bg-clip-text text-transparent">
            eGeopolis
          </span>
          <p className="text-xs font-semibold tracking-widest text-cyan-400 uppercase">
            STRATEGY • NATIONS • POWER
          </p>
        </div>
      </div>
      <h1 className="max-w-2xl text-5xl font-black leading-tight">
        Build a nation. Break a nation.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        An open-source MMO social-strategy browser game inspired by e-Sim — economy, warfare and
        politics in one persistent world. Work daily, train your strength, fight in real-time battles,
        trade on global markets, and get elected.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="rounded-xl bg-primary px-6 py-3 font-bold text-black hover:bg-primary-dark">
          Enter the world
        </Link>
        <a href="https://esim.fandom.com/wiki/E-Sim_Wiki" target="_blank" className="rounded-xl border border-line px-6 py-3 font-bold hover:bg-panel">
          Mechanics wiki
        </a>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
            <f.icon className="mb-3 h-6 w-6 text-primary" />
            <h3 className="font-bold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted">{f.text}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-xs text-muted">
        Demo accounts after seeding: demo1@egeopolis.dev / demo1234 · MIT licensed · Next.js + NestJS + PostgreSQL + Redis
      </p>
    </main>
  );
}
