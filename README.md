# Open Social Dashboard

Local, self-hosted dashboard that collects daily follower/subscriber snapshots from public profile URLs without OAuth.

## Stack
- Node.js 20+
- TypeScript (strict)
- SQLite (`better-sqlite3`)
- Playwright (fallback extraction)
- Express API + Vite/React UI

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your local accounts file and edit the targets:
   ```bash
   cp config/accounts.json.example config/accounts.json
   ```
3. Run one collection:
   ```bash
   npm run collect
   ```
4. Print a CLI summary of metrics across all accounts:
   ```bash
   npm run summary
   ```
   Output format is chat-friendly lines: `Account - Followers - Trend`.
5. Start dashboard + API:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:5173`.

By default dev mode uses `APP_API_PORT=8790` for API + Vite proxy consistency.

## Accounts Config
`config/accounts.json` contains:
- `id` string (stable id)
- `platform` (`instagram` | `tiktok` | `rednote` | `youtube` | `x`)
- `label` string
- `url` string
- `enabled` boolean
- `auth_profile_source_path` optional string path to a Chromium user-data directory to seed a dashboard-local Playwright profile copy. Use it for platforms that need an authenticated session in Playwright, such as RedNote or Instagram when Meta serves a login wall.
- `manual_followers` optional integer to bypass collection and store an exact follower count manually for that account.

Use `config/accounts.json.example` as the committed template and keep your real `config/accounts.json` local-only.

## Collector Behavior
- Attempts fast HTML extraction first (10s timeout).
- Falls back to Playwright extraction when HTML fails (20s navigation timeout).
- If `manual_followers` is set for an account, the collector skips scraping and records that exact value with `method=manual`.
- Retries Playwright once for transient errors.
- Writes exactly one snapshot per account per Bangkok day (`UNIQUE(account_id, date)` with upsert).
- Detects block/captcha pages and records failed status with `error_code=captcha`.
- Preserves lower-bound public counts (for example RedNote `1万+`) as `>=` values instead of dropping them entirely.
- When an account defines `auth_profile_source_path`, the collector seeds a one-time local copy under `data/playwright-profiles/<account-id>` and uses that copied profile for Playwright collection.
- If that copied authenticated session stops yielding exact follower data, collection records `error_code=auth_required` so the dashboard can signal that the local profile needs to be refreshed.
- To reseed an auth profile copy, close the source browser/profile first, then delete `data/playwright-profiles/<account-id>` and rerun collection.
- Keeps deltas and growth rates conservative: they only compute when both snapshots are exact counts.
- API process includes an in-process auto-collector loop (every 24h) while running.
- Auto-collector can be configured with:
  - `AUTO_COLLECT_DISABLED=1` to disable
  - `AUTO_COLLECT_INTERVAL_HOURS=24` to change interval (max 168)

## API
- `GET /api/accounts`
- `GET /api/accounts/:id/snapshots?days=365`
- `POST /api/collect/run`

## Cron Examples (09:00 Asia/Bangkok)
Set `TZ=Asia/Bangkok` inside cron command so date bucketing matches collector logic.
Use cron if you want fixed wall-clock scheduling; the in-process loop runs every N hours from server start.

### macOS
```cron
0 9 * * * cd /Users/you/Projects/social-dashboard && TZ=Asia/Bangkok /usr/local/bin/node /Users/you/Projects/social-dashboard/node_modules/.bin/tsx /Users/you/Projects/social-dashboard/collector/run.ts >> /Users/you/Projects/social-dashboard/collector.log 2>&1
```

### Linux
```cron
0 9 * * * cd /home/you/social-dashboard && TZ=Asia/Bangkok /usr/bin/node /home/you/social-dashboard/node_modules/.bin/tsx /home/you/social-dashboard/collector/run.ts >> /home/you/social-dashboard/collector.log 2>&1
```

## Troubleshooting
- `Failed to load: API returned 404` in UI:
  - Usually means `/api` is proxying to a different service on your machine.
  - Check that local API is running at `http://localhost:8790/api/health`.
  - If port conflict exists, set a custom API port for both processes:
    ```bash
    APP_API_PORT=8890 npm run dev
    ```
- `captcha` failures: platform is showing bot checks; collection stores failed snapshots by design.
- `extract_failed`: selectors/text patterns did not produce a confident count; connector needs tuning.
- `auth_required`: the platform served a login wall or the copied authenticated browser profile is no longer usable; refresh or reseed the local profile copy.
- `playwright_failed`: install browser binaries:
  ```bash
  npx playwright install chromium
  ```
