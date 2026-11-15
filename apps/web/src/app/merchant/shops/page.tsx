"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type BusinessType,
  type Location,
  type Shop,
  type StaffRole,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StaffRoleStub() {
  const [role, setRole] = useState<StaffRole>("owner");
  useEffect(() => {
    api.getStaff().then((r) => setRole(r.staff.role)).catch(() => undefined);
  }, []);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--nx-muted)]">Staff role stub</span>
      <select
        className="h-9 rounded-md border border-[var(--nx-line)] bg-white/80 px-2"
        value={role}
        onChange={async (e) => {
          const next = e.target.value as StaffRole;
          const r = await api.setStaff(next);
          setRole(r.staff.role);
        }}
      >
        <option value="owner">Owner</option>
        <option value="cashier">Cashier</option>
      </select>
      <span className="text-xs text-[var(--nx-muted)]">
        Cashier can sell/confirm; cannot edit storage secrets or manage shops.
      </span>
    </div>
  );
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("retail");
  const [vpa, setVpa] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locName, setLocName] = useState("");
  const [minMargin, setMinMargin] = useState("0");
  const [underMode, setUnderMode] = useState<"warn" | "block">("warn");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.listShops();
    setShops(r.shops);
    setActiveId(r.activeShopId);
    const active = r.shops.find((s) => s.id === r.activeShopId);
    if (active) {
      setMinMargin(String(active.minMarginPercent ?? 0));
      setUnderMode(active.underMarginMode ?? "warn");
    }
    if (r.activeShopId) {
      const loc = await api.listLocations(r.activeShopId);
      setLocations(loc.locations);
    }
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const onChange = () => load().catch(() => undefined);
    window.addEventListener("nx-shop-changed", onChange);
    return () => window.removeEventListener("nx-shop-changed", onChange);
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Shops & locations</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Multi-outlet / mall install. Optional per-shop VPA override stub. Pharmacy unlocks
        batch/expiry; mall_kiosk and supermarket supported for retail chains.
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <StaffRoleStub />

      <form
        className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await api.createShop({
              name,
              businessType,
              vpaOverride: vpa.trim() || null,
            });
            setName("");
            setVpa("");
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        }}
      >
        <Input
          required
          placeholder="Shop / outlet name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
        >
          <option value="retail">Retail</option>
          <option value="restaurant">Restaurant / café</option>
          <option value="pharmacy">Pharmacy</option>
          <option value="mall_kiosk">Mall kiosk</option>
          <option value="supermarket">Supermarket</option>
        </select>
        <Input
          className="sm:col-span-2"
          placeholder="Optional VPA override (stub)"
          value={vpa}
          onChange={(e) => setVpa(e.target.value)}
        />
        <Button type="submit">Add shop</Button>
      </form>

      <ul className="mt-8 space-y-3">
        {shops.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--nx-line)] py-3"
          >
            <div>
              <p className="font-medium">
                {s.name}{" "}
                {s.isActive && (
                  <span className="text-xs text-[var(--nx-accent)]">active</span>
                )}
              </p>
              <p className="text-sm text-[var(--nx-muted)]">
                {s.businessType}
                {s.vpaOverride ? ` · ${s.vpaOverride}` : ""}
                {` · min margin ${s.minMarginPercent ?? 0}% (${s.underMarginMode ?? "warn"})`}
              </p>
            </div>
            <div className="flex gap-2">
              {!s.isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={async () => {
                    await api.activateShop(s.id);
                    window.dispatchEvent(new Event("nx-shop-changed"));
                    await load();
                  }}
                >
                  Activate
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={async () => {
                  try {
                    await api.deleteShop(s.id);
                    await load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Delete failed");
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="font-display mt-12 text-2xl">Margin guard (active shop)</h2>
      <p className="mt-1 max-w-xl text-sm text-[var(--nx-muted)]">
        Before inventory/quick-sale QR: block sell below cost; warn or block under min margin %.
      </p>
      <form
        className="mt-4 flex max-w-md flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!activeId) return;
          await api.updateShop(activeId, {
            minMarginPercent: Number(minMargin),
            underMarginMode: underMode,
          });
          await load();
        }}
      >
        <Input
          type="number"
          step="any"
          min={0}
          max={100}
          value={minMargin}
          onChange={(e) => setMinMargin(e.target.value)}
          placeholder="Min margin %"
        />
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={underMode}
          onChange={(e) => setUnderMode(e.target.value as "warn" | "block")}
        >
          <option value="warn">Warn under margin</option>
          <option value="block">Block under margin</option>
        </select>
        <Button type="submit">Save margin</Button>
      </form>

      <h2 className="font-display mt-12 text-2xl">Locations (active shop)</h2>
      <form
        className="mt-4 flex max-w-md gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!activeId) return;
          await api.createLocation({ name: locName, shopId: activeId });
          setLocName("");
          await load();
        }}
      >
        <Input
          required
          placeholder="Shelf, kitchen, storefront…"
          value={locName}
          onChange={(e) => setLocName(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>
      <ul className="mt-4 space-y-2">
        {locations.map((l) => (
          <li key={l.id} className="flex items-center justify-between text-sm">
            <span>{l.name}</span>
            <button
              type="button"
              className="text-[var(--nx-muted)] underline"
              onClick={async () => {
                await api.deleteLocation(l.id);
                await load();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
