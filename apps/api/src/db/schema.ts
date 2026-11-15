import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type Db = Database.Database;

let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const dir = path.dirname(config.dbPath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Test helper — close and reopen against a path. */
export function resetDbForTests(dbPath: string): Db {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  db = null;
  (config as { dbPath: string }).dbPath = dbPath;
  return getDb();
}

function hasColumn(database: Db, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function migrate(database: Db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS merchant_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      primary_vpa TEXT NOT NULL,
      secondary_vpa TEXT,
      display_name TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      logo_url TEXT,
      webhook_url TEXT,
      webhook_secret TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      merchant_order_id TEXT,
      amount_paise INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL,
      note TEXT,
      receiving_vpa TEXT NOT NULL,
      receiving_name TEXT NOT NULL,
      upi_uri TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      confirm_duplicate INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confirmed_at TEXT,
      failure_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_amount_status ON payments(amount_paise, status);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      response_code INTEGER,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode TEXT NOT NULL DEFAULT 'local_only',
      secondary_path TEXT,
      online_primary_enabled INTEGER NOT NULL DEFAULT 0,
      online_connection_enc TEXT,
      last_backup_at TEXT,
      last_backup_error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gst_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      rate_percent REAL NOT NULL DEFAULT 18,
      split_mode TEXT NOT NULL DEFAULT 'cgst_sgst',
      price_mode TEXT NOT NULL DEFAULT 'inclusive',
      hsn_code TEXT,
      fy_start_month INTEGER NOT NULL DEFAULT 4,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_type TEXT NOT NULL DEFAULT 'retail',
      vpa_override TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      location_id TEXT,
      name TEXT NOT NULL,
      sku TEXT,
      qty REAL NOT NULL DEFAULT 0,
      unit_price_paise INTEGER,
      bulk_qty REAL,
      bulk_cost_paise INTEGER,
      pack_size TEXT,
      batch_no TEXT,
      expiry_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_shop ON inventory_items(shop_id);
    CREATE INDEX IF NOT EXISTS idx_locations_shop ON locations(shop_id);

    CREATE TABLE IF NOT EXISTS display_sessions (
      code TEXT PRIMARY KEY,
      shop_id TEXT,
      label TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS receipt_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      paper_width_mm INTEGER NOT NULL DEFAULT 58,
      header_text TEXT,
      footer_text TEXT,
      thank_you_text TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Additive columns (migrate-on-boot)
  if (!hasColumn(database, "shops", "business_type")) {
    database.exec(`ALTER TABLE shops ADD COLUMN business_type TEXT NOT NULL DEFAULT 'retail'`);
  }
  if (!hasColumn(database, "inventory_items", "bulk_qty")) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN bulk_qty REAL`);
  }
  if (!hasColumn(database, "inventory_items", "bulk_cost_paise")) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN bulk_cost_paise INTEGER`);
  }
  if (!hasColumn(database, "inventory_items", "pack_size")) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN pack_size TEXT`);
  }
  if (!hasColumn(database, "inventory_items", "batch_no")) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN batch_no TEXT`);
  }
  if (!hasColumn(database, "inventory_items", "expiry_date")) {
    database.exec(`ALTER TABLE inventory_items ADD COLUMN expiry_date TEXT`);
  }
  if (!hasColumn(database, "payments", "shop_id")) {
    database.exec(`ALTER TABLE payments ADD COLUMN shop_id TEXT`);
  }
  if (!hasColumn(database, "payments", "taxable_paise")) {
    database.exec(`ALTER TABLE payments ADD COLUMN taxable_paise INTEGER`);
  }
  if (!hasColumn(database, "payments", "cgst_paise")) {
    database.exec(`ALTER TABLE payments ADD COLUMN cgst_paise INTEGER`);
  }
  if (!hasColumn(database, "payments", "sgst_paise")) {
    database.exec(`ALTER TABLE payments ADD COLUMN sgst_paise INTEGER`);
  }
  if (!hasColumn(database, "payments", "igst_paise")) {
    database.exec(`ALTER TABLE payments ADD COLUMN igst_paise INTEGER`);
  }
  if (!hasColumn(database, "payments", "gst_rate_percent")) {
    database.exec(`ALTER TABLE payments ADD COLUMN gst_rate_percent REAL`);
  }
  if (!hasColumn(database, "payments", "gst_split_mode")) {
    database.exec(`ALTER TABLE payments ADD COLUMN gst_split_mode TEXT`);
  }
  if (!hasColumn(database, "payments", "gst_price_mode")) {
    database.exec(`ALTER TABLE payments ADD COLUMN gst_price_mode TEXT`);
  }

  database.exec(`CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id)`);

  const now = new Date().toISOString();

  const row = database.prepare("SELECT id FROM merchant_config WHERE id = 1").get();
  if (!row) {
    database
      .prepare(
        `INSERT INTO merchant_config (
          id, primary_vpa, secondary_vpa, display_name, brand_name,
          accent_color, logo_url, webhook_url, webhook_secret, updated_at
        ) VALUES (1, @primary_vpa, @secondary_vpa, @display_name, @brand_name,
          @accent_color, @logo_url, @webhook_url, @webhook_secret, @updated_at)`
      )
      .run({
        primary_vpa: config.primaryVpa,
        secondary_vpa: config.secondaryVpa || null,
        display_name: config.displayName,
        brand_name: config.brandName,
        accent_color: config.accentColor,
        logo_url: config.logoUrl || null,
        webhook_url: config.webhookUrl || null,
        webhook_secret: config.webhookSecret,
        updated_at: now,
      });
  }

  const storage = database.prepare("SELECT id FROM storage_settings WHERE id = 1").get();
  if (!storage) {
    database
      .prepare(
        `INSERT INTO storage_settings (id, mode, secondary_path, online_primary_enabled, online_connection_enc, last_backup_at, last_backup_error, updated_at)
         VALUES (1, 'local_only', NULL, 0, NULL, NULL, NULL, ?)`
      )
      .run(now);
  }

  const gst = database.prepare("SELECT id FROM gst_settings WHERE id = 1").get();
  if (!gst) {
    database
      .prepare(
        `INSERT INTO gst_settings (id, rate_percent, split_mode, price_mode, hsn_code, fy_start_month, updated_at)
         VALUES (1, 18, 'cgst_sgst', 'inclusive', NULL, 4, ?)`
      )
      .run(now);
  }

  const receipt = database.prepare("SELECT id FROM receipt_settings WHERE id = 1").get();
  if (!receipt) {
    database
      .prepare(
        `INSERT INTO receipt_settings (id, paper_width_mm, header_text, footer_text, thank_you_text, updated_at)
         VALUES (1, 58, NULL, NULL, 'Thank you! Visit again.', ?)`
      )
      .run(now);
  }

  // Ensure at least one default shop for multi-shop UX
  const shopCount = database.prepare("SELECT COUNT(*) as c FROM shops WHERE deleted_at IS NULL").get() as {
    c: number;
  };
  if (shopCount.c === 0) {
    const id = "shop_default";
    database
      .prepare(
        `INSERT INTO shops (id, name, business_type, vpa_override, is_active, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'retail', NULL, 1, ?, ?, NULL)`
      )
      .run(id, config.displayName || "Main shop", now, now);
  }

  database
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', '2')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run();
}
