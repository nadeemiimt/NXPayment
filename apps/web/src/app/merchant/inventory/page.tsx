"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type InventoryItem,
  type Location,
  type PricingBreakdown,
  type ProjectedProfit,
  type Shop,
} from "@/lib/api";
import { formatInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function paiseFromRupees(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function InventoryPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("0");
  const [bulkQty, setBulkQty] = useState("1000");
  const [bulkCostInr, setBulkCostInr] = useState("3500");
  const [unitPriceInr, setUnitPriceInr] = useState("4");
  const [sellN, setSellN] = useState("100");
  const [locationId, setLocationId] = useState("");
  const [packSize, setPackSize] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [preview, setPreview] = useState<{
    pricing: PricingBreakdown;
    projectedProfit: ProjectedProfit;
  } | null>(null);

  const isPharmacy = shop?.businessType === "pharmacy";

  const load = useCallback(async () => {
    const shops = await api.listShops();
    const active = shops.shops.find((s) => s.id === shops.activeShopId) ?? shops.shops[0] ?? null;
    setShop(active);
    if (!active) return;
    const [inv, loc] = await Promise.all([
      api.listInventory(active.id),
      api.listLocations(active.id),
    ]);
    setItems(inv.items);
    setLocations(loc.locations);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const onChange = () => load().catch(() => undefined);
    window.addEventListener("nx-shop-changed", onChange);
    return () => window.removeEventListener("nx-shop-changed", onChange);
  }, [load]);

  const pricingBody = useMemo(
    () => ({
      bulkQty: Number(bulkQty) || 0,
      bulkCostPaise: paiseFromRupees(bulkCostInr),
      unitPricePaise: paiseFromRupees(unitPriceInr),
      sellQty: Number(sellN) || 0,
    }),
    [bulkQty, bulkCostInr, unitPriceInr, sellN]
  );

  useEffect(() => {
    if (pricingBody.bulkQty <= 0) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .previewPricing(pricingBody)
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 200);
    return () => clearTimeout(t);
  }, [pricingBody]);

  function resetForm() {
    setEditing(null);
    setName("");
    setSku("");
    setQty("0");
    setBulkQty("1000");
    setBulkCostInr("3500");
    setUnitPriceInr("4");
    setSellN("100");
    setLocationId("");
    setPackSize("");
    setBatchNo("");
    setExpiryDate("");
  }

  function fillEdit(item: InventoryItem) {
    setEditing(item);
    setName(item.name);
    setSku(item.sku ?? "");
    setQty(String(item.qty));
    setBulkQty(String(item.bulkQty ?? 1));
    setBulkCostInr(String((item.bulkCostPaise ?? 0) / 100));
    setUnitPriceInr(String((item.unitPricePaise ?? 0) / 100));
    setSellN(String(item.projectedProfit?.sellQty ?? 100));
    setLocationId(item.locationId ?? "");
    setPackSize(item.packSize ?? "");
    setBatchNo(item.batchNo ?? "");
    setExpiryDate(item.expiryDate ?? "");
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Inventory</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Quick-add with bulk cost and retail sell price. Profit/unit is derived — e.g. 1000 @ ₹3500
        cost, sell ₹4 → ₹0.50/unit; sell 100 → ₹50.
        {isPharmacy ? " Pharmacy fields: batch, expiry, pack size." : ""}
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <form
        className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!shop) return;
          const body = {
            shopId: shop.id,
            name,
            sku: sku || null,
            qty: Number(qty) || 0,
            bulkQty: Number(bulkQty),
            bulkCostPaise: paiseFromRupees(bulkCostInr),
            unitPricePaise: paiseFromRupees(unitPriceInr),
            locationId: locationId || null,
            packSize: packSize || null,
            batchNo: batchNo || null,
            expiryDate: expiryDate || null,
          };
          try {
            if (editing) await api.updateInventory(editing.id, body);
            else await api.createInventory(body);
            resetForm();
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          }
        }}
      >
        <Input
          className="sm:col-span-2"
          required
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input placeholder="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} />
        <Input
          type="number"
          step="any"
          placeholder="Stock qty"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          required
          type="number"
          step="any"
          placeholder="Bulk qty (e.g. 1000)"
          value={bulkQty}
          onChange={(e) => setBulkQty(e.target.value)}
        />
        <Input
          required
          type="number"
          step="0.01"
          placeholder="Bulk cost ₹"
          value={bulkCostInr}
          onChange={(e) => setBulkCostInr(e.target.value)}
        />
        <Input
          required
          type="number"
          step="0.01"
          placeholder="Sell price / unit ₹"
          value={unitPriceInr}
          onChange={(e) => setUnitPriceInr(e.target.value)}
        />
        <Input
          type="number"
          step="any"
          placeholder="Profit if sell N"
          value={sellN}
          onChange={(e) => setSellN(e.target.value)}
        />
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        {isPharmacy && (
          <>
            <Input
              placeholder="Pack size"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
            />
            <Input
              placeholder="Batch no."
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
            <Input
              type="date"
              placeholder="Expiry"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </>
        )}

        {preview && (
          <div className="sm:col-span-2 rounded-md border border-[var(--nx-line)] bg-white/50 px-4 py-3 text-sm">
            <p>
              Cost/unit{" "}
              <strong>{formatInr(preview.pricing.costPerUnitPaise)}</strong>
              {" · "}
              Profit/unit{" "}
              <strong className="text-[var(--nx-accent)]">
                {formatInr(preview.pricing.profitPerUnitPaise)}
              </strong>
              {" · "}
              Profit if sell {preview.projectedProfit.sellQty}:{" "}
              <strong>{formatInr(preview.projectedProfit.profitPaise)}</strong>
            </p>
          </div>
        )}

        <div className="sm:col-span-2 flex gap-2">
          <Button type="submit">{editing ? "Update item" : "Quick add"}</Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">
            <tr>
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Qty</th>
              <th className="py-2 pr-3">Sell</th>
              <th className="py-2 pr-3">Cost/u</th>
              <th className="py-2 pr-3">Profit/u</th>
              <th className="py-2 pr-3">If sell N</th>
              <th className="py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--nx-line)]">
                <td className="py-3 pr-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-[var(--nx-muted)]">
                    {[item.sku, item.locationName, item.batchNo, item.expiryDate]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </td>
                <td className="py-3 pr-3">{item.qty}</td>
                <td className="py-3 pr-3">
                  {item.unitPricePaise != null ? formatInr(item.unitPricePaise) : "—"}
                </td>
                <td className="py-3 pr-3">
                  {item.pricing ? formatInr(item.pricing.costPerUnitPaise) : "—"}
                </td>
                <td className="py-3 pr-3 text-[var(--nx-accent)]">
                  {item.pricing ? formatInr(item.pricing.profitPerUnitPaise) : "—"}
                </td>
                <td className="py-3 pr-3">
                  {item.projectedProfit
                    ? `${formatInr(item.projectedProfit.profitPaise)} (N=${item.projectedProfit.sellQty})`
                    : "—"}
                </td>
                <td className="py-3 whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-3 text-[var(--nx-accent)] underline"
                    onClick={() => fillEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-[var(--nx-muted)] underline"
                    onClick={async () => {
                      await api.deleteInventory(item.id);
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="mt-4 text-sm text-[var(--nx-muted)]">No items yet for this shop.</p>
        )}
      </div>
    </div>
  );
}
