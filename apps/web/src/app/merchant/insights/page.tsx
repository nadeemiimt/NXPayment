"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Insights } from "@/lib/api";

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.insights();
    setInsights(r.insights);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const onChange = () => load().catch(() => undefined);
    window.addEventListener("nx-shop-changed", onChange);
    return () => window.removeEventListener("nx-shop-changed", onChange);
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Insights</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Deterministic pattern engine for the active shop. Optional LLM only when a key is configured
        — never faked as GenAI.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      {insights && (
        <>
          <p className="mt-4 text-sm text-[var(--nx-muted)]">{insights.note}</p>
          <p className="text-xs text-[var(--nx-muted)]">
            LLM key {insights.llmEnabled ? "present" : "absent"}
            {insights.llmUsed ? " · used" : " · heuristics only"}
          </p>

          <h2 className="font-display mt-10 text-2xl">Patterns</h2>
          <ul className="mt-4 space-y-4">
            {insights.patterns.map((p) => (
              <li key={p.id} className="border-b border-[var(--nx-line)] pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{p.title}</p>
                  {p.metric && (
                    <span className="text-sm text-[var(--nx-accent)]">{p.metric}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--nx-muted)]">{p.detail}</p>
              </li>
            ))}
          </ul>

          <h2 className="font-display mt-10 text-2xl">Recommendations</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {insights.recommendations.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-[var(--nx-line)] bg-white/50 p-4"
              >
                <p className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">
                  {r.kind === "focus" ? "Focus" : "Deprioritize"} · {r.source}
                </p>
                <h3 className="font-display mt-2 text-xl">{r.title}</h3>
                <p className="mt-2 text-sm text-[var(--nx-muted)]">{r.reason}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
