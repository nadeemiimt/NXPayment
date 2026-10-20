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

/** Close and drop the singleton — for integration tests with a fresh temp DB. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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

    CREATE TABLE IF NOT EXISTS credit_observations (
      id TEXT PRIMARY KEY,
      payment_id TEXT,
      amount_paise INTEGER,
      utr TEXT,
      source TEXT NOT NULL,
      raw_text TEXT,
      outcome TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_credit_obs_utr ON credit_observations(utr);
    CREATE INDEX IF NOT EXISTS idx_credit_obs_created ON credit_observations(created_at);
  `);

  ensureColumn(database, "merchant_config", "auto_confirm_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "merchant_config", "android_auto_confirm", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "merchant_config", "email_auto_confirm", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "merchant_config", "email_provider", "TEXT");
  ensureColumn(database, "merchant_config", "email_address", "TEXT");
  ensureColumn(database, "merchant_config", "email_secret", "TEXT");
  ensureColumn(database, "merchant_config", "email_connected_at", "TEXT");
  ensureColumn(database, "merchant_config", "single_slot_fifo", "INTEGER NOT NULL DEFAULT 1");

  ensureColumn(database, "payments", "risk_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "payments", "risk_signals", "TEXT");

  database.exec(`
    CREATE TABLE IF NOT EXISTS merchant_alerts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      payment_id TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON merchant_alerts(created_at);
  `);

  const row = database.prepare("SELECT id FROM merchant_config WHERE id = 1").get();
  if (!row) {
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO merchant_config (
          id, primary_vpa, secondary_vpa, display_name, brand_name,
          accent_color, logo_url, webhook_url, webhook_secret, updated_at,
          auto_confirm_enabled, android_auto_confirm, email_auto_confirm
        ) VALUES (1, @primary_vpa, @secondary_vpa, @display_name, @brand_name,
          @accent_color, @logo_url, @webhook_url, @webhook_secret, @updated_at,
          0, 0, 0)`
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
}

function ensureColumn(
  database: Db,
  table: string,
  column: string,
  ddl: string
): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
