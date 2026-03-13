# Open Social Dashboard Implementation Progress

Last updated: 2026-02-26

## Summary

- Local TypeScript project scaffold is in place with collector, SQLite persistence, API server, and React dashboard.
- Daily collection pipeline works with idempotent upsert by `account_id + date` and fallback from HTML extraction to Playwright.
- MVP dashboard supports account overview, missing/failed today sections, and account-level trend/stats views.
- First testable MVP state is reached: collector run, snapshot persistence, and API endpoints are all executable locally.
- Profile-specific tuning improved live collection: Instagram and TikTok now collect follower counts successfully with updated profiles.
- YouTube extraction is now working for the configured channel via localized URL handling and direct subscriber-text parsing.
- RedNote security-block responses are now classified as `captcha` failures (instead of generic extraction failures), improving reliability reporting.
- Overview table now surfaces account name/handle context (derived from profile URL) alongside label for easier profile identification.
- RedNote direct-profile HTML now checks SSR `interactions` data for `fans` counts when exact, while ambiguous compact values (for example `10+`, `1千+`) are rejected to avoid guessed snapshots.
- Overview now includes aggregate cross-account totals (followers, 1d delta, 7d delta, health counts), and the duplicate platform column was removed from the account table.
- Number normalization now supports exact Chinese compact units (`千/万/亿`, including decimal forms like `1.2万`) and continues rejecting approximate `+` forms to avoid guessed counts.
- Dashboard UI received a minimalist visual refresh across overview and detail pages (typography, spacing, status pills, delta coloring, chart container, and responsive polish) without changing MVP features.
- API runtime now supports automatic background collection every 24 hours while running, with overlap protection and environment controls for disable/interval.
- Added a dedicated CLI summary command to print aggregate and per-account metrics directly from SQLite for quick terminal checks.
- CLI summary output is now simplified for chat sharing using line format: `Account - Followers - Trend`.
- Added X (x.com/twitter.com) platform support with HTML + Playwright extraction paths; configured account now collects successfully.
- Dev runtime networking is now more robust: frontend proxy and API server share `APP_API_PORT` (default `8790`), preventing accidental `/api` routing to unrelated local services on `8787`.

## Milestones Checklist

### Phase 1 — Foundation and Data Model

- [x] Create Node.js + TypeScript strict project setup with collector/web/config structure.
- [x] Implement `config/accounts.json` loading and validation for supported platforms.
- [x] Create SQLite schema for `accounts` and `snapshots` with unique daily snapshot constraint.
- [x] Implement DB initialization and account/snapshot upsert queries.

### Phase 2 — Collection Pipeline (MVP)

- [x] Implement number normalization for raw follower/subscriber formats (`12,345`, `12.3K`, `1.2M`, `3B`).
- [x] Implement captcha/block detection heuristics and failed snapshot recording.
- [x] Implement platform connectors (Instagram, TikTok, RedNote, YouTube) with multi-strategy extraction and confidence levels.
- [x] Implement collector run flow with HTML-first strategy, Playwright fallback, single retry, and per-account logging.
- [x] Ensure daily idempotency via upsert on `account_id + date`.
- [x] Tune captcha detection heuristics to reduce false positives on normal platform HTML responses.
- [x] Add support for RedNote shortlink domain matching (`xhslink.com`) in connector URL support checks.
- [x] Tune YouTube connector for localized page responses and raw subscriber text extraction (`1.3K subscribers` style).
- [x] Classify RedNote `website-login/error` security responses (`httpStatus=461`) as captcha/blocked failures.
- [x] Add RedNote SSR-state (`window.__INITIAL_STATE__`) extraction path for `fans` interaction counts when precise.
- [x] Tighten number parsing to reject ambiguous lower-bound/localized compact values (`10+`, `1千+`) instead of storing guessed integers.
- [x] Add exact parsing for Chinese compact units (`千/万/亿`, including decimals) while preserving strict rejection of approximate `+` values.
- [x] Add X platform connector support (`x.com`/`twitter.com`) with multi-strategy follower extraction and config validation support.

### Phase 3 — Local API and Dashboard (MVP)

- [x] Implement `GET /api/accounts` with latest snapshot, derived deltas, and missing/failed today flags.
- [x] Implement `GET /api/accounts/:id/snapshots?days=365` with time-series and simple account stats.
- [x] Implement `POST /api/collect/run` to trigger local collection manually.
- [x] Build overview UI table sorted by 7d delta with missing/failed today sections.
- [x] Build account detail UI with follower trend chart and basic stats.
- [x] Surface account name/handle context in the overview table to distinguish profiles with generic labels.
- [x] Add overview-level aggregate stats that sum metrics across accounts and simplify table columns by removing redundant platform data.
- [x] Apply a minimalist UI polish pass for overview/detail readability and mobile responsiveness while preserving existing behavior.
- [x] Add in-process auto-collection scheduling (24h interval) in API runtime with run-lock protection and configurable env controls.

### Phase 4 — Documentation and Runbook

- [x] Add README setup instructions (`npm install`, `npm run collect`, `npm run dev`).
- [x] Add cron examples for macOS/Linux at 09:00 Asia/Bangkok with explicit node/project paths.
- [x] Add `npm run summary` CLI tool to print all-account metric summaries (aggregate + per-account deltas/status) and document usage.
- [x] Simplify CLI summary formatting for chat usage (`account - follower - trend` lines).
- [x] Align dev API port and Vite proxy via `APP_API_PORT` (default `8790`) and document 404/port-conflict troubleshooting.
- [ ] Validate extraction reliability against a broader real-world account set and tune selectors/patterns. (Deferred: RedNote extraction is blocked in this environment by platform security checks)
