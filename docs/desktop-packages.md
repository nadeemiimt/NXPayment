# Merchant desktop packages (Mac + Windows)

Thin **Electron launcher** that starts the local **API + Web** stack from an NXPayment
checkout and opens **`/merchant/tokens`** on first run. Real secrets are **not** bundled —
first launch copies `deploy/.env.example` → `.env` if missing.

## Layout

| Path | Role |
| --- | --- |
| `apps/desktop/` | Electron main process + electron-builder config |
| `scripts/merchant-launch.sh` | Mac/Linux CLI launcher (no Electron) |
| `scripts/merchant-launch.ps1` | Windows PowerShell launcher |
| `deploy/.env.example` | Template only — no secrets |

Requires **Node.js 20+** on the merchant machine (API uses Fastify 5 / native modules).

## Dev run (from Mac)

```bash
# From repo root
cp deploy/.env.example .env   # if needed
npm install
npm install --workspace=@nxpayment/desktop
npm run desktop             # electron .
# or without Electron:
npm run merchant:launch
```

## Build packages from Mac

```bash
npm install --workspace=@nxpayment/desktop
npm run desktop:pack:mac    # → apps/desktop/dist/*.dmg + *.zip
```

Verified on this Mac (arm64): `npm run desktop:pack:mac` produced
`apps/desktop/dist/NXPayment-0.1.0-arm64.dmg` and `NXPayment-0.1.0-arm64-mac.zip`
(unsigned; default Electron icon).

### Windows from Mac (honest limits)

`electron-builder --win` from this Apple Silicon Mac **failed** at Wine/`rcedit`
(`wine64: bad CPU type in executable`). Do **not** rely on Mac→Windows cross-build here.

1. **Build on Windows** (required for reliable `.exe` / portable):

   ```powershell
   npm install --workspace=@nxpayment/desktop
   npm run desktop:pack:win
   # → apps/desktop/dist/*-portable.exe and NSIS installer
   ```

2. **CI on `windows-latest`** with the same `desktop:pack:win` script; upload artifacts.

3. **Fallback:** ship `scripts/merchant-launch.ps1` + the git checkout; merchant runs Node 20+ directly (no Electron).

Mac `.dmg` / `.zip` build cleanly on macOS with `desktop:pack:mac` (unsigned by default:
`mac.identity: null`).

## What the packaged app expects

The Electron binary is a **launcher**, not a full offline bundle of Next/Fastify.

1. Merchant clones or unpacks the **NXPayment** repo (or sets `NXPAYMENT_ROOT`).
2. Runs `npm install` once (Node 20+).
3. Opens the desktop app (or `merchant-launch` script).
4. First run → Tokens UI to paste VPA / secrets.

`extraResources` in the package only include `env.example` + docs — **never** a filled `.env`.

## First-run Tokens UI

- URL: `http://127.0.0.1:4321/merchant/tokens`
- Marker file: `.local/first-run-done` (gitignored under `.local/`)

## Related

- [`required-tokens.md`](./required-tokens.md)
- [`auto-confirm.md`](./auto-confirm.md)
