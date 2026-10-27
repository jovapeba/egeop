"use client";

import { useMemo, useState } from "react";
import { FileText, HandCoins, ScrollText, ShieldCheck } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Badge, Button, Card, CardTitle, Input, Tabs, useToast, useWallet } from "@/lib/ui";
import { FilterBar, FilterSelect } from "@/lib/filters";

interface Contract {
  id: string;
  type: "LOAN" | "PACK_SALE";
  creatorId: string;
  counterpartyId: string | null;
  amountGold: number;
  durationDays: number;
  interestPct: number;
  totalDueGold: number;
  status: string;
}
interface AuditEntry {
  id: string;
  note: string;
  at: string;
}
interface Me {
  id: string;
  isAdmin: boolean;
}

export default function ContractsPage() {
  const { push } = useToast();
  const { refresh } = useWallet();
  const [tab, setTab] = useState<"open" | "create" | "audit">("open");

  const { data: contracts, reload } = useApi<Contract[]>("/contracts");
  const { data: audit } = useApi<AuditEntry[]>("/contracts/audit");
  const { data: me } = useApi<Me>("/auth/me");

  // loan form
  const [loanAmount, setLoanAmount] = useState("10");
  const [loanDays, setLoanDays] = useState("7");
  const [loanInterest, setLoanInterest] = useState("10");
  // pack form
  const [packAmount, setPackAmount] = useState("50");
  const [packPrice, setPackPrice] = useState("55");

  async function createLoan() {
    try {
      await api("/contracts/loans", {
        method: "POST",
        body: { amountGold: Number(loanAmount), durationDays: Number(loanDays), interestPct: Number(loanInterest) },
      });
      push(`Loan listed — ${loanAmount}g escrowed for ${loanDays} days at ${loanInterest}% interest.`, "success");
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function createPack() {
    try {
      await api("/contracts/packs", {
        method: "POST",
        body: { amountGold: Number(packAmount), priceGold: Number(packPrice) },
      });
      push(`Pack sale listed — ${packAmount}g escrowed at ${packPrice}g.`, "success");
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function accept(c: Contract) {
    try {
      await api(`/contracts/${c.id}/accept`, { method: "POST" });
      push(c.type === "LOAN" ? "Loan accepted — gold credited to you." : "Pack purchased!", "success");
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function repay(c: Contract) {
    try {
      const total = (c.totalDueGold / 100).toFixed(2);
      await api(`/contracts/${c.id}/repay`, { method: "POST" });
      push(`Loan repaid — ${total}g transferred to the lender.`, "success");
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  async function staffCancel(c: Contract) {
    try {
      await api(`/contracts/${c.id}/cancel-staff`, { method: "POST" });
      push("Debt cancelled — escrow returned to the creator.", "info");
      reload(); refresh();
    } catch (e) { push((e as Error).message, "error"); }
  }

  const desc = (c: Contract) =>
    c.type === "LOAN"
      ? `${(c.amountGold / 100).toFixed(2)}g loan · ${c.durationDays}d · ${c.interestPct}% → repay ${(c.totalDueGold / 100).toFixed(2)}g`
      : `${(c.amountGold / 100).toFixed(2)}g pack for ${(c.totalDueGold / 100).toFixed(2)}g`;

  // Open-contract filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredContracts = useMemo(
    () =>
      (contracts ?? []).filter(
        (c) => (typeFilter === "all" || c.type === typeFilter) && (statusFilter === "all" || c.status === statusFilter),
      ),
    [contracts, typeFilter, statusFilter],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon={<FileText size={14} />}>Contracts — loans & pack sales</CardTitle>
        <Tabs
          tabs={[
            { id: "open", label: "Open contracts" },
            { id: "create", label: "Create contract" },
            { id: "audit", label: "Public audit" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "open" && (
          <div className="space-y-1.5">
            <FilterBar count={filteredContracts.length}>
              <FilterSelect
                label="type"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: "all", label: "all" },
                  { value: "LOAN", label: "loans" },
                  { value: "PACK_SALE", label: "pack sales" },
                ]}
              />
              <FilterSelect
                label="status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "all" },
                  { value: "OPEN", label: "open" },
                  { value: "ACCEPTED", label: "accepted" },
                  { value: "COMPLETED", label: "completed" },
                ]}
              />
            </FilterBar>
            {filteredContracts.map((c) => {
              const mineToRepay = c.counterpartyId === me?.id && c.type === "LOAN" && c.status !== "COMPLETED";
              const canAccept = c.status === "OPEN" && c.creatorId !== me?.id;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2.5">
                  <p className="flex-1 text-sm font-bold">{desc(c)}</p>
                  <Badge color={c.type === "LOAN" ? "cyan" : "gold"}>{c.type}</Badge>
                  <Badge color={c.status === "OPEN" ? "emerald" : "slate"}>{c.status}</Badge>
                  {canAccept && (
                    <Button size="sm" onClick={() => accept(c)}>
                      <HandCoins size={13} /> accept
                    </Button>
                  )}
                  {mineToRepay && (
                    <Button size="sm" variant="outline" onClick={() => repay(c)}>
                      repay {(c.totalDueGold / 100).toFixed(2)}g
                    </Button>
                  )}
                  {me?.isAdmin && (c.status === "OPEN" || c.status === "ACCEPTED") && (
                    <Button size="sm" variant="ghost" onClick={() => staffCancel(c)}>
                      <ShieldCheck size={13} /> staff cancel
                    </Button>
                  )}
                </div>
              );
            })}
            {filteredContracts.length === 0 && (contracts ?? []).length > 0 && <p className="text-sm text-muted">No contracts match your filters.</p>}
            {(contracts ?? []).length === 0 && <p className="text-sm text-muted">No open contracts.</p>}
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase text-muted">Money loan (escrowed immediately)</p>
              <div className="flex flex-wrap gap-2">
                <Input className="w-24" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="amount g" />
                <Input className="w-20" value={loanDays} onChange={(e) => setLoanDays(e.target.value)} placeholder="days" />
                <Input className="w-20" value={loanInterest} onChange={(e) => setLoanInterest(e.target.value)} placeholder="interest %" />
                <Button onClick={createLoan}>
                  <FileText size={14} /> list loan
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                Total due is auto-calculated: amount + interest. You receive repayment when the borrower settles.
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase text-muted">Pack sale (direct gold sale)</p>
              <div className="flex flex-wrap gap-2">
                <Input className="w-24" value={packAmount} onChange={(e) => setPackAmount(e.target.value)} placeholder="pack g" />
                <Input className="w-24" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} placeholder="price g" />
                <Button onClick={createPack}>
                  <HandCoins size={14} /> list pack
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                The buyer cannot be the creator — the purchaser accepts and pays in one step.
              </p>
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-1">
            <p className="mb-1 text-xs text-muted">
              Public feed — transactions are disclosed without amounts, per the audit policy.
            </p>
            {(audit ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2">
                <ScrollText size={13} className="shrink-0 text-muted" />
                <p className="flex-1 text-sm">{a.note}</p>
                <span className="text-[10px] text-muted">{new Date(a.at).toLocaleString()}</span>
              </div>
            ))}
            {(audit ?? []).length === 0 && <p className="text-sm text-muted">No public transactions yet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
