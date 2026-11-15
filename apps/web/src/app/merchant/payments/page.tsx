"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Payment } from "@/lib/api";
import { formatInr } from "@/lib/utils";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPayments()
      .then((r) => setPayments(r.payments))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Payments</h1>
      <p className="mt-2 text-[var(--nx-muted)]">
        Recent payment sessions. Print a thermal receipt from any settled sale.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--nx-line)] bg-white/60">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--nx-line)] text-xs uppercase tracking-wider text-[var(--nx-muted)]">
            <tr>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Order / note</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Id</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-[var(--nx-line)]/70 last:border-0">
                <td className="px-4 py-3 font-medium">{formatInr(p.amountPaise)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-4 py-3 text-[var(--nx-muted)]">
                  {p.merchantOrderId || p.note || "—"}
                </td>
                <td className="px-4 py-3 text-[var(--nx-muted)]">
                  {new Date(p.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.id.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/merchant/receipts/${p.id}`}
                    className="text-[var(--nx-accent)] underline"
                  >
                    Receipt
                  </Link>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--nx-muted)]">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "SUCCESS"
      ? "bg-[var(--nx-mist)] text-[var(--nx-accent)]"
      : status === "FAILED" || status === "EXPIRED" || status === "CANCELLED"
        ? "bg-[#fde8e8] text-[#9B2C2C]"
        : "bg-[#fff6e5] text-[#8a5a00]";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}
