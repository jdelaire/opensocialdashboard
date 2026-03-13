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
2. Edit account targets in `config/accounts.json`.
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

## Collector Behavior
- Attempts fast HTML extraction first (10s timeout).
- Falls back to Playwright extraction when HTML fails (20s navigation timeout).
- Retries Playwright once for transient errors.
- Writes exactly one snapshot per account per Bangkok day (`UNIQUE(account_id, date)` with upsert).
- Detects block/captcha pages and records failed status with `error_code=captcha`.
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
- `playwright_failed`: install browser binaries:
  ```bash
  npx playwright install chromium
  ```
