# MVP Build Prompt — Local Social Profile Stats Dashboard (No Auth)

You are a senior full-stack engineer. Build an MVP that runs locally and tracks follower trends for multiple social platforms by visiting public profile URLs once per day. No OAuth. No official API integration. Best-effort scraping only.

## Goal
Create a local, self-hosted system that:
1) Visits a list of public profile URLs (Instagram, TikTok, RedNote, YouTube) once per day.
2) Extracts follower/subscriber count if possible.
3) Stores one daily snapshot per account in a local SQLite database.
4) Serves a local web UI to visualize trends and basic analytics.

This is an MVP. Focus on robustness, clear failure reporting, and an architecture that makes future connector improvements easy.

## Non-goals
- No authentication or API keys.
- No posting, commenting, liking, or interacting.
- No “growth hacking” or automation beyond reading public pages.
- No complex forecasting.
- No cloud deployment.

## Product Requirements

### Inputs
- A config file `config/accounts.json` that contains an array of accounts:
  - `id` (string, stable identifier)
  - `platform` (instagram | tiktok | rednote | youtube)
  - `label` (string)
  - `url` (string)
  - `enabled` (boolean)

### Data Collection (Daily)
- A collector script runs once per day and writes exactly one snapshot per account per date.
- If the collector runs multiple times the same day, it must be idempotent (upsert by `account_id + date`).
- Collector must:
  - Try fast HTTP fetch + HTML parse first (cheap path).
  - If extraction fails or ambiguous, fallback to Playwright navigation + DOM extraction (headless).
  - If still fails, record a snapshot with `followers=null`, `status=failed`, plus an error code/message (do NOT write guessed values).
- Collector must record:
  - `date` (local date in Asia/Bangkok)
  - `followers` (integer or null)
  - `method` (html | playwright)
  - `confidence` (high | medium | low)
  - `status` (ok | failed)
  - `error_code` and `error_message` (nullable)
  - `raw_excerpt` (short string excerpt used to derive the number, max 200 chars, nullable)
  - `collected_at` (timestamp)

### Web UI
Local web app with:
- Overview page:
  - Table of accounts showing: platform, label, latest followers, daily delta, 7d delta, last collected status
  - “Missing today” / “Failed today” section
- Account detail page:
  - Time-series chart of followers
  - Simple stats: min/max, best day, worst day, 7d growth rate
- No login required (localhost only).

### Reliability / Guardrails
- Timeouts:
  - HTTP fetch timeout 10s
  - Playwright navigation timeout 20s
- Retries:
  - At most 1 retry for Playwright on transient errors
- Block/Captcha detection:
  - If page looks like a bot check / captcha / “verify you’re human”, record `status=failed`, `error_code=captcha`
- Number normalization:
  - Support formats: `12,345`, `12.3K`, `1.2M`, `3B`
  - Normalize to integer
  - Handle spaces and localized separators conservatively (don’t guess if unsure)

## Tech Stack
- Node.js 20+
- TypeScript
- Playwright
- SQLite (better-sqlite3 or sqlite3 + a light query helper)
- Express (API) + Vite/React (UI) OR Next.js (single app). Choose the simplest approach.
- Charting: a simple chart lib (e.g., Chart.js, Recharts). Keep it minimal.

## Project Structure
- `collector/`
  - `run.ts` (main entry)
  - `connectors/`
    - `base.ts` (connector interface)
    - `instagram.ts`
    - `tiktok.ts`
    - `rednote.ts`
    - `youtube.ts`
  - `extract/`
    - `normalize.ts` (parse “K/M/B” etc.)
    - `blockDetect.ts` (captcha detection heuristics)
  - `db/`
    - `schema.sql`
    - `index.ts` (db init + queries)
- `web/`
  - UI + API (or single monorepo app if using Next)
- `config/accounts.json`
- `package.json`
- `README.md`

## Database Schema (SQLite)
Create `snapshots` with a unique constraint:
- `accounts`
  - `id TEXT PRIMARY KEY`
  - `platform TEXT NOT NULL`
  - `label TEXT NOT NULL`
  - `url TEXT NOT NULL`
  - `enabled INTEGER NOT NULL DEFAULT 1`
- `snapshots`
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `account_id TEXT NOT NULL`
  - `date TEXT NOT NULL` (YYYY-MM-DD)
  - `followers INTEGER NULL`
  - `method TEXT NOT NULL`
  - `confidence TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `error_code TEXT NULL`
  - `error_message TEXT NULL`
  - `raw_excerpt TEXT NULL`
  - `collected_at TEXT NOT NULL`
  - UNIQUE(account_id, date)

## Connector Interface
Each connector implements:
- `supports(url: string): boolean`
- `collectViaHtml(url: string): Promise<CollectResult>`
- `collectViaPlaywright(url: string, page: Page): Promise<CollectResult>`

`CollectResult`:
- `followers: number | null`
- `method: "html" | "playwright"`
- `confidence: "high" | "medium" | "low"`
- `status: "ok" | "failed"`
- `error_code?: string`
- `error_message?: string`
- `raw_excerpt?: string`

## Extraction Strategy (MVP Level)
Implement platform-specific strategies with multiple fallbacks:
- Instagram:
  - Prefer extracting from visible text near “followers”
  - Fallback: scan page text for patterns like `followers` and extract adjacent numbers
- TikTok:
  - Prefer visible follower count element
  - Fallback: parse rendered text
- RedNote:
  - Prefer visible follower count; if not present reliably, be willing to fail cleanly
- YouTube:
  - Extract subscriber count from rendered profile header text (may be “subscribers”)
  - Normalize “1.23M subscribers” → 1230000

Important: do not hardcode a single selector. Provide at least 2-3 fallback approaches per platform. If extraction is uncertain, return `followers=null` and `status=failed` with `error_code=extract_failed`.

## Scheduler
Provide 2 ways to run daily:
1) Manual: `npm run collect`
2) Cron example in README for macOS and Linux:
   - Runs daily at 09:00 Asia/Bangkok local time
   - Ensures the project directory and node path are correct

## API Endpoints
- `GET /api/accounts` → list accounts + latest snapshot + derived stats
- `GET /api/accounts/:id/snapshots?days=365` → time series
- `POST /api/collect/run` (optional) → trigger collection manually from UI (still local)

## Derived Stats
Compute in API layer:
- `delta_1d`: latest - previous
- `delta_7d`: latest - value 7 days ago (closest prior snapshot)
- `delta_30d`: same idea
- `pct_7d`: delta_7d / value_7d_ago (guard divide by zero)

## UI Requirements
- Overview table with sorting by 7d delta
- Simple line chart on detail page
- Display last collection status + error info

## Deliverables
- Working local repo with:
  - `npm install && npm run collect` populates SQLite
  - `npm run dev` starts the dashboard on localhost
- Clear README with:
  - Setup steps
  - How to add accounts
  - How to run collector
  - Cron setup examples
  - Troubleshooting (captcha, blocks, extraction failures)

## Quality Bar
- TypeScript strict mode
- Clear logs from collector: per account start/end, method used, success/failure, extracted number
- No silent failures
- Keep it small and shippable

Build it now.
