"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type LoyaltyCustomer,
  type LoyaltyNudge,
  type LoyaltyRules,
} from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoyaltyPage() {
  const [rules, setRules] = useState<LoyaltyRules | null>(null);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [nudges, setNudges] = useState<LoyaltyNudge[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pointsPerRupee, setPointsPerRupee] = useState("1");
  const [paisePerPoint, setPaisePerPoint] = useState("100");
  const [stampVisits, setStampVisits] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, c, n] = await Promise.all([
      api.getLoyaltyRules(),
      api.listLoyaltyCustomers(),
      api.loyaltyNudges(),
    ]);
    setRules(r.rules);
    setPointsPerRupee(String(r.rules.pointsPerRupee));
    setPaisePerPoint(String(r.rules.paisePerPointRedeem));
    setStampVisits(String(r.rules.stampVisitsRequired));
    setCustomers(c.customers);
    setNudges(n.nudges);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Loyalty</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Merchant-side CRM — points, tiers, stamps. UPI settlement stays direct to your VPA.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}
      {msg && <p className="mt-3 text-sm text-[var(--nx-accent)]">{msg}</p>}

      <h2 className="font-display mt-10 text-2xl">Rules</h2>
      <form
        className="mt-4 grid max-w-xl gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.updateLoyaltyRules({
            pointsPerRupee: Number(pointsPerRupee),
            paisePerPointRedeem: Number(paisePerPoint),
            stampVisitsRequired: Number(stampVisits),
          });
          setMsg("Loyalty rules saved.");
          await load();
        }}
      >
        <Input
          type="number"
          step="any"
          value={pointsPerRupee}
          onChange={(e) => setPointsPerRupee(e.target.value)}
          placeholder="Points / ₹"
        />
        <Input
          type="number"
          value={paisePerPoint}
          onChange={(e) => setPaisePerPoint(e.target.value)}
          placeholder="Paise / point redeem"
        />
        <Input
          type="number"
          value={stampVisits}
          onChange={(e) => setStampVisits(e.target.value)}
          placeholder="Stamp visits"
        />
        <Button type="submit" className="sm:col-span-3">
          Save rules
        </Button>
      </form>
      {rules && (
        <p className="mt-2 text-sm text-[var(--nx-muted)]">
          Silver @ {formatInr(rules.silverThresholdPaise)} · Gold @{" "}
          {formatInr(rules.goldThresholdPaise)} lifetime spend
        </p>
      )}

      <h2 className="font-display mt-10 text-2xl">Enroll customer</h2>
      <form
        className="mt-4 flex max-w-xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.enrollLoyaltyCustomer({ phone, name: name || null });
          setPhone("");
          setName("");
          setMsg("Customer enrolled.");
          await load();
        }}
      >
        <Input
          required
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Enroll</Button>
      </form>

      <h2 className="font-display mt-10 text-2xl">Customers</h2>
      <ul className="mt-4 space-y-3">
        {customers.map((c) => (
          <li key={c.id} className="border-b border-[var(--nx-line)] pb-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {c.name || c.phone}{" "}
                <span className="text-xs uppercase text-[var(--nx-accent)]">{c.tier}</span>
              </p>
              <p>
                {c.points} pts · {c.visitCount} visits · {formatInr(c.lifetimeSpendPaise)}
              </p>
            </div>
            <p className="text-[var(--nx-muted)]">
              {c.phone}
              {c.daysSinceLastPurchase != null
                ? ` · last ${c.daysSinceLastPurchase}d ago`
                : " · no purchases yet"}
              {c.stamp.required > 0
                ? ` · stamp ${c.stamp.visits}/${c.stamp.required}`
                : ""}
            </p>
          </li>
        ))}
        {customers.length === 0 && (
          <p className="text-[var(--nx-muted)]">No loyalty customers yet.</p>
        )}
      </ul>

      <h2 className="font-display mt-10 text-2xl">Encourage</h2>
      <div className="mt-4 space-y-4">
        {nudges.map((n) => (
          <article key={n.id} className="rounded-lg border border-[var(--nx-line)] bg-white/50 p-4">
            <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">{n.kind}</p>
            <h3 className="font-display mt-1 text-xl">{n.title}</h3>
            <p className="mt-1 text-sm text-[var(--nx-muted)]">{n.reason}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const r = await api.loyaltyEncourage({
                    customerId: n.customerId,
                    channel: "note",
                    message: n.encourageAction.message,
                  });
                  setMsg(r.note);
                }}
              >
                Note
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  const r = await api.loyaltyEncourage({
                    customerId: n.customerId,
                    channel: "whatsapp_stub",
                    message: n.encourageAction.message,
                  });
                  setMsg(`${r.note} → ${r.message}`);
                }}
              >
                WhatsApp stub
              </Button>
            </div>
          </article>
        ))}
        {nudges.length === 0 && (
          <p className="text-sm text-[var(--nx-muted)]">No nudge suggestions yet.</p>
        )}
      </div>
    </div>
  );
}
