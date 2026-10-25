/**
 * NXPayment merchant desktop launcher.
 * Starts API + Web from the monorepo (or NXPAYMENT_ROOT) and opens the Tokens UI.
 * Does not bundle real secrets.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const http = require("node:http");

const API_PORT = Number(process.env.API_PORT || 3847);
const WEB_PORT = Number(process.env.WEB_PORT || 4321);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const TOKENS_URL = `${WEB_URL}/merchant/tokens`;

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let mainWindow = null;

function resolveRepoRoot() {
  if (process.env.NXPAYMENT_ROOT) {
    return path.resolve(process.env.NXPAYMENT_ROOT);
  }
  // Dev: apps/desktop → repo root
  const fromPackage = path.resolve(__dirname, "../..");
  if (fs.existsSync(path.join(fromPackage, "package.json"))) {
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(fromPackage, "package.json"), "utf8")
      );
      if (pkg.name === "nxpayment") return fromPackage;
    } catch {
      /* ignore */
    }
  }
  // Packaged: look next to the .app / exe for a sibling nxpayment/ checkout
  const candidates = [
    path.join(process.resourcesPath || "", "nxpayment"),
    path.join(path.dirname(process.execPath), "nxpayment"),
    path.join(path.dirname(process.execPath), "..", "nxpayment"),
    path.join(app.getPath("home"), "NXPayment"),
    path.join(app.getPath("home"), "Documents", "NXPayment"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  return fromPackage;
}

function ensureEnv(repoRoot) {
  const envPath = path.join(repoRoot, ".env");
  const example = path.join(repoRoot, "deploy", ".env.example");
  if (!fs.existsSync(envPath) && fs.existsSync(example)) {
    fs.copyFileSync(example, envPath);
  }
  return !fs.existsSync(path.join(repoRoot, ".local", "first-run-done"));
}

function markFirstRunDone(repoRoot) {
  const dir = path.join(repoRoot, ".local");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "first-run-done"), new Date().toISOString());
}

function waitHttp(url, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        if (Date.now() - started > timeoutMs) {
          return reject(new Error(`Timeout waiting for ${url}`));
        }
        setTimeout(tick, 500);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          return reject(new Error(`Timeout waiting for ${url}`));
        }
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function spawnNpm(repoRoot, script) {
  const isWin = process.platform === "win32";
  const npm = isWin ? "npm.cmd" : "npm";
  const child = spawn(npm, ["run", script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DB_PATH: path.join(repoRoot, "data", "nxpayment.sqlite"),
      API_PORT: String(API_PORT),
      WEB_PORT: String(WEB_PORT),
      NEXT_PUBLIC_API_URL: API_URL,
    },
    stdio: "ignore",
    shell: isWin,
  });
  children.push(child);
  child.on("exit", (code) => {
    console.log(`[desktop] ${script} exited code=${code}`);
  });
  return child;
}

function stopChildren() {
  for (const c of children) {
    try {
      if (!c.killed) c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

async function startStack(repoRoot) {
  fs.mkdirSync(path.join(repoRoot, "data"), { recursive: true });
  const firstRun = ensureEnv(repoRoot);

  // Prefer already-running stack
  try {
    await waitHttp(`${API_URL}/health`, 1500);
    await waitHttp(WEB_URL, 1500);
    return { firstRun, reused: true };
  } catch {
    /* start fresh */
  }

  spawnNpm(repoRoot, "dev:api");
  spawnNpm(repoRoot, "dev:web");
  await waitHttp(`${API_URL}/health`);
  await waitHttp(WEB_URL);
  return { firstRun, reused: false };
}

function createWindow(openTokens) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "NXPayment",
  });
  const target = openTokens ? TOKENS_URL : WEB_URL;
  mainWindow.loadURL(target).catch(() => {
    mainWindow.loadFile(path.join(__dirname, "first-run.html"));
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  const repoRoot = resolveRepoRoot();
  if (!fs.existsSync(path.join(repoRoot, "apps", "api"))) {
    dialog.showErrorBox(
      "NXPayment stack not found",
      `Could not find the NXPayment monorepo at:\n${repoRoot}\n\nSet NXPAYMENT_ROOT to your checkout, run npm install, then relaunch.`
    );
    app.quit();
    return;
  }

  try {
    const { firstRun } = await startStack(repoRoot);
    createWindow(firstRun);
    if (firstRun) markFirstRunDone(repoRoot);
  } catch (err) {
    dialog.showErrorBox(
      "Failed to start NXPayment",
      `${err instanceof Error ? err.message : String(err)}\n\nRepo: ${repoRoot}\nNeed Node 20+ and npm install.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopChildren();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(false);
  }
});
