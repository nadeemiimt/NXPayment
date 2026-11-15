"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type InventoryItem,
  type Location,
  type PricingBreakdown,
  type ProjectedProfit,
  type SaleMode,
  type Shop,
  type WeightUnit,
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
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [weightSaleId, setWeightSaleId] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState("0.25");

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("0");
  const [saleMode, setSaleMode] = useState<SaleMode>("unit");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
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
      api.listInventory({ shopId: active.id, page, pageSize: 25, q: search || undefined }),
      api.listLocations(active.id),
    ]);
    setItems(inv.items);
    setTotalPages(inv.totalPages);
    setTotal(inv.total);
    setLocations(loc.locations);
  }, [page, search]);

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
      saleMode,
    }),
    [bulkQty, bulkCostInr, unitPriceInr, sellN, saleMode]
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
    setSaleMode("unit");
    setWeightUnit("kg");
    setBulkQty("1000");
    setBulkCostInr("3500");
    setUnitPriceInr("4");
    setSellN(saleMode === "weight" ? "1" : "100");
    setLocationId("");
    setPackSize("");
    setBatchNo("");
    setExpiryDate("");
  }

  function fillEdit(item: InventoryItem) {
    setEditing(item);
    setName(item.name);
    setSku(item.sku ?? "");
    setSaleMode(item.saleMode);
    setWeightUnit(item.weightUnit ?? "kg");
    setQty(
      item.saleMode === "weight"
        ? String(item.qtyDisplay ?? 0)
        : String(item.qty)
    );
    setBulkQty(String(item.bulkQty ?? 1));
    setBulkCostInr(String((item.bulkCostPaise ?? 0) / 100));
    setUnitPriceInr(String((item.unitPricePaise ?? 0) / 100));
    setSellN(String(item.projectedProfit?.sellQty ?? (item.saleMode === "weight" ? 1 : 100)));
    setLocationId(item.locationId ?? "");
    setPackSize(item.packSize ?? "");
    setBatchNo(item.batchNo ?? "");
    setExpiryDate(item.expiryDate ?? "");
  }

  async function doQuickSale(item: InventoryItem) {
    setError(null);
    try {
      if (item.saleMode === "weight") {
        setWeightSaleId(item.id);
        return;
      }
      const r = await api.quickSale(item.id, { qty: 1, confirmDuplicate: true });
      router.push(`/merchant/receipts/${r.payment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick sale failed");
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Inventory</h1>
      <p className="mt-2 max-w-2xl text-[var(--nx-muted)]">
        Unit or loose weight items. Quick-sale opens a UPI payment and deducts stock.
        {isPharmacy ? " Pharmacy: batch / expiry / pack size." : ""}
      </p>
      {error && <p className="mt-3 text-sm text-[#9B2C2C]">{error}</p>}

      <form
        className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!shop) return;
          const body: Record<string, unknown> = {
            shopId: shop.id,
            name,
            sku: sku || null,
            saleMode,
            weightUnit: saleMode === "weight" ? weightUnit : null,
            bulkQty: Number(bulkQty),
            bulkCostPaise: paiseFromRupees(bulkCostInr),
            unitPricePaise: paiseFromRupees(unitPriceInr),
            locationId: locationId || null,
            packSize: packSize || null,
            batchNo: batchNo || null,
            expiryDate: expiryDate || null,
          };
          if (saleMode === "weight") body.qtyDisplay = Number(qty) || 0;
          else body.qty = Number(qty) || 0;
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
        <select
          className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
          value={saleMode}
          onChange={(e) => {
            const m = e.target.value as SaleMode;
            setSaleMode(m);
            setSellN(m === "weight" ? "1" : "100");
          }}
        >
          <option value="unit">Unit (piece)</option>
          <option value="weight">Weight / loose</option>
        </select>
        {saleMode === "weight" ? (
          <select
            className="h-11 rounded-md border border-[var(--nx-line)] bg-white/80 px-3"
            value={weightUnit}
            onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
          >
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
          </select>
        ) : (
          <Input placeholder="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} />
        )}
        <Input
          type="number"
          step="any"
          placeholder={saleMode === "weight" ? `Stock (${weightUnit})` : "Stock qty"}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          required
          type="number"
          step="any"
          placeholder={saleMode === "weight" ? `Bulk qty (${weightUnit})` : "Bulk qty"}
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
          placeholder={saleMode === "weight" ? `Sell ₹ / ${weightUnit}` : "Sell ₹ / unit"}
          value={unitPriceInr}
          onChange={(e) => setUnitPriceInr(e.target.value)}
        />
        <Input
          type="number"
          step="any"
          placeholder={saleMode === "weight" ? "Profit if sell N units of weight" : "Profit if sell N"}
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
            <Input placeholder="Pack size" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
            <Input placeholder="Batch no." value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </>
        )}

        {preview && (
          <div className="sm:col-span-2 rounded-md border border-[var(--nx-line)] bg-white/50 px-4 py-3 text-sm">
            <p>
              Cost/{saleMode === "weight" ? weightUnit : "u"}{" "}
              <strong>{formatInr(preview.pricing.costPerUnitPaise)}</strong>
              {" · "}
              Profit/{saleMode === "weight" ? weightUnit : "u"}{" "}
              <strong className="text-[var(--nx-accent)]">
                {formatInr(preview.pricing.profitPerUnitPaise)}
              </strong>
              {" · "}
              If sell {preview.projectedProfit.sellQty}:{" "}
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search name / SKU"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <span className="text-sm text-[var(--nx-muted)]">
          {total} items · page {page}/{totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      {weightSaleId && (
        <form
          className="mt-4 flex max-w-md flex-wrap items-end gap-2 rounded-md border border-[var(--nx-line)] p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api.quickSale(weightSaleId, {
                weightDisplay: Number(weightInput),
                confirmDuplicate: true,
              });
              setWeightSaleId(null);
              router.push(`/merchant/receipts/${r.payment.id}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Sale failed");
            }
          }}
        >
          <label className="text-sm">
            Weight
            <Input
              className="mt-1"
              type="number"
              step="any"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              required
            />
          </label>
          <Button type="submit">Sell & UPI</Button>
          <Button type="button" variant="ghost" onClick={() => setWeightSaleId(null)}>
            Cancel
          </Button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[var(--nx-muted)]">
            <tr>
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Stock</th>
              <th className="py-2 pr-3">Rate</th>
              <th className="py-2 pr-3">Profit/u</th>
              <th className="py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--nx-line)]">
                <td className="py-3 pr-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-[var(--nx-muted)]">
                    {item.saleMode === "weight" ? `loose · ${item.weightUnit}` : "unit"}
                    {item.sku ? ` · ${item.sku}` : ""}
                    {item.locationName ? ` · ${item.locationName}` : ""}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  {item.saleMode === "weight"
                    ? `${item.qtyDisplay ?? 0} ${item.weightUnit}`
                    : item.qty}
                </td>
                <td className="py-3 pr-3">
                  {item.unitPricePaise != null
                    ? `${formatInr(item.unitPricePaise)}${item.saleMode === "weight" ? `/${item.weightUnit}` : ""}`
                    : "—"}
                </td>
                <td className="py-3 pr-3 text-[var(--nx-accent)]">
                  {item.pricing ? formatInr(item.pricing.profitPerUnitPaise) : "—"}
                </td>
                <td className="py-3 whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-3 text-[var(--nx-accent)] underline"
                    onClick={() => doQuickSale(item)}
                  >
                    Quick sale
                  </button>
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
