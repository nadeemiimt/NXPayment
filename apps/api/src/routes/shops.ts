import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  listInventory,
  previewPricing,
  updateInventoryItem,
} from "../services/inventory.js";
import {
  createLocation,
  createShop,
  deleteLocation,
  deleteShop,
  getActiveShop,
  getShop,
  listLocations,
  listShops,
  setActiveShop,
  updateLocation,
  updateShop,
} from "../services/shops.js";

const shopSchema = z.object({
  name: z.string().min(1).max(128),
  businessType: z.enum(["retail", "restaurant", "pharmacy"]).optional(),
  vpaOverride: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)
    .nullable()
    .optional(),
});

const locationSchema = z.object({
  name: z.string().min(1).max(128),
  shopId: z.string().min(1).optional(),
});

const inventorySchema = z.object({
  shopId: z.string().min(1).optional(),
  name: z.string().min(1).max(256),
  sku: z.string().max(64).nullable().optional(),
  qty: z.number().optional(),
  unitPricePaise: z.number().int().nonnegative(),
  bulkQty: z.number().positive(),
  bulkCostPaise: z.number().int().nonnegative(),
  locationId: z.string().nullable().optional(),
  packSize: z.string().max(64).nullable().optional(),
  batchNo: z.string().max(64).nullable().optional(),
  expiryDate: z.string().max(32).nullable().optional(),
});

const inventoryUpdateSchema = inventorySchema.partial().extend({
  unitPricePaise: z.number().int().nonnegative().optional(),
  bulkQty: z.number().positive().optional(),
  bulkCostPaise: z.number().int().nonnegative().optional(),
});

function resolveShopId(explicit?: string | null): string {
  if (explicit) {
    const s = getShop(explicit);
    if (!s) throw new Error("Shop not found");
    return s.id;
  }
  const active = getActiveShop();
  if (!active) throw new Error("No active shop");
  return active.id;
}

export async function shopRoutes(app: FastifyInstance) {
  app.get("/api/merchant/shops", async () => {
    return { shops: listShops(), activeShopId: getActiveShop()?.id ?? null };
  });

  app.post("/api/merchant/shops", async (req, reply) => {
    const parsed = shopSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const shop = createShop(parsed.data);
    return reply.code(201).send({ shop });
  });

  app.put("/api/merchant/shops/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = shopSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const shop = updateShop(id, parsed.data);
      return { shop };
    } catch (err) {
      return reply.code(404).send({ error: "not_found", message: (err as Error).message });
    }
  });

  app.post("/api/merchant/shops/:id/activate", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const shop = setActiveShop(id);
      return { shop };
    } catch (err) {
      return reply.code(404).send({ error: "not_found", message: (err as Error).message });
    }
  });

  app.delete("/api/merchant/shops/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      deleteShop(id);
      return { ok: true, shops: listShops(), activeShopId: getActiveShop()?.id ?? null };
    } catch (err) {
      return reply.code(400).send({ error: "delete_failed", message: (err as Error).message });
    }
  });

  app.get("/api/merchant/locations", async (req, reply) => {
    const q = req.query as { shopId?: string };
    try {
      const shopId = resolveShopId(q.shopId);
      return { locations: listLocations(shopId), shopId };
    } catch (err) {
      return reply.code(400).send({ error: "bad_shop", message: (err as Error).message });
    }
  });

  app.post("/api/merchant/locations", async (req, reply) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const shopId = resolveShopId(parsed.data.shopId);
      const location = createLocation(shopId, parsed.data.name);
      return reply.code(201).send({ location });
    } catch (err) {
      return reply.code(400).send({ error: "create_failed", message: (err as Error).message });
    }
  });

  app.put("/api/merchant/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ name: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      return { location: updateLocation(id, parsed.data.name) };
    } catch (err) {
      return reply.code(404).send({ error: "not_found", message: (err as Error).message });
    }
  });

  app.delete("/api/merchant/locations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      deleteLocation(id);
      return { ok: true };
    } catch (err) {
      return reply.code(404).send({ error: "not_found", message: (err as Error).message });
    }
  });

  app.get("/api/merchant/inventory", async (req, reply) => {
    const q = req.query as { shopId?: string };
    try {
      const shopId = resolveShopId(q.shopId);
      return { items: listInventory(shopId), shopId };
    } catch (err) {
      return reply.code(400).send({ error: "bad_shop", message: (err as Error).message });
    }
  });

  app.post("/api/merchant/inventory", async (req, reply) => {
    const parsed = inventorySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const shopId = resolveShopId(parsed.data.shopId);
      const item = createInventoryItem({ ...parsed.data, shopId });
      return reply.code(201).send({ item });
    } catch (err) {
      return reply.code(400).send({ error: "create_failed", message: (err as Error).message });
    }
  });

  app.get("/api/merchant/inventory/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { sellQty?: string };
    const sellQty = q.sellQty ? Number(q.sellQty) : undefined;
    const item = getInventoryItem(id, sellQty);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return { item };
  });

  app.put("/api/merchant/inventory/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = inventoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      const item = updateInventoryItem(id, parsed.data);
      return { item };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = message === "Item not found" ? 404 : 400;
      return reply.code(code).send({ error: code === 404 ? "not_found" : "update_failed", message });
    }
  });

  app.delete("/api/merchant/inventory/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      deleteInventoryItem(id);
      return { ok: true };
    } catch (err) {
      return reply.code(404).send({ error: "not_found", message: (err as Error).message });
    }
  });

  app.post("/api/merchant/inventory/preview-pricing", async (req, reply) => {
    const parsed = z
      .object({
        bulkQty: z.number().positive(),
        bulkCostPaise: z.number().int().nonnegative(),
        unitPricePaise: z.number().int().nonnegative(),
        sellQty: z.number().nonnegative().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    try {
      return previewPricing(parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: "preview_failed", message: (err as Error).message });
    }
  });
}
