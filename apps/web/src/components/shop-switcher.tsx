"use client";

import { useEffect, useState } from "react";
import { api, type Shop } from "@/lib/api";

export function ShopSwitcher() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.listShops();
    setShops(r.shops);
    setActiveId(r.activeShopId);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  if (shops.length <= 1) {
    return shops[0] ? (
      <span className="text-xs text-[var(--nx-muted)]">{shops[0].name}</span>
    ) : null;
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--nx-muted)]">Shop</span>
      <select
        className="h-11 min-w-0 max-w-[11rem] rounded-md border border-[var(--nx-line)] bg-white/80 px-2 text-base sm:h-9 sm:max-w-none sm:text-sm"
        disabled={busy}
        value={activeId ?? ""}
        onChange={async (e) => {
          const id = e.target.value;
          setBusy(true);
          try {
            await api.activateShop(id);
            setActiveId(id);
            window.dispatchEvent(new Event("nx-shop-changed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.businessType === "pharmacy" ? " · Pharmacy" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
