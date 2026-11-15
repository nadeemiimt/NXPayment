"use client";

import type { ChartPoint } from "@/lib/api";

export function SimpleBarChart({
  title,
  points,
  formatValue,
}: {
  title: string;
  points: ChartPoint[];
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const fmt = formatValue ?? ((n: number) => String(n));

  return (
    <div>
      <h3 className="font-display text-lg">{title}</h3>
      <div className="mt-4 flex h-40 items-end gap-1">
        {points.map((p) => (
          <div key={p.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[var(--nx-accent)]/80 transition-all"
              style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
              title={fmt(p.value)}
            />
            <span className="truncate text-[10px] text-[var(--nx-muted)]">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
