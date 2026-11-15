import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API_PORT = process.env.E2E_API_PORT ?? "3847";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "4321";
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

const e2eDir = path.join(os.tmpdir(), `nxpayment-e2e-${process.pid}`);
fs.mkdirSync(e2eDir, { recursive: true });
const DB_PATH = path.join(e2eDir, "nxpayment.sqlite");

const hermeticEnv: NodeJS.ProcessEnv = {
  ...process.env,
  API_PORT,
  API_HOST: "127.0.0.1",
  DB_PATH,
  CORS_ORIGIN: "*",
  PRIMARY_VPA: "e2e-merchant@upi",
  MERCHANT_DISPLAY_NAME: "E2E Merchant",
  BRAND_NAME: "NXPayment",
  ADMIN_TOKEN: "e2e-admin-token",
  WEBHOOK_SECRET: "e2e-webhook-secret",
  WEBHOOK_URL: "",
  GMAIL_CLIENT_ID: "",
  GMAIL_CLIENT_SECRET: "",
  GMAIL_REFRESH_TOKEN: "",
  WHATSAPP_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  META_ACCESS_TOKEN: "",
  INSIGHTS_LLM_KEY: "",
  INSIGHTS_LLM_URL: "",
  NEXT_PUBLIC_API_URL: API_URL,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start:api",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: hermeticEnv,
    },
    {
      command: "node scripts/e2e-web.mjs",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: hermeticEnv,
    },
  ],
});
