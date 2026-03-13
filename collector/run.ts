import { Browser, chromium } from "playwright";
import { loadAccountsConfig } from "./config.js";
import { getConnector } from "./connectors/index.js";
import { initDb, syncAccounts, upsertSnapshot } from "./db/index.js";
import { AccountConfig, CollectResult } from "./types.js";
import { bangkokDate } from "./utils/time.js";

interface RunOptions {
  source?: "cli" | "api" | "scheduler";
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTransientPlaywrightError(errorCode?: string, errorMessage?: string): boolean {
  const transientCodes = new Set(["playwright_navigation_failed", "timeout", "network"]);
  if (errorCode && transientCodes.has(errorCode)) {
    return true;
  }

  const haystack = (errorMessage || "").toLowerCase();
  return haystack.includes("timeout") || haystack.includes("net::") || haystack.includes("connection");
}

function normalizeResult(result: CollectResult): CollectResult {
  const normalized: CollectResult = { ...result };
  if (result.raw_excerpt) {
    normalized.raw_excerpt = result.raw_excerpt.slice(0, 200);
  }
  return normalized;
}

async function collectWithPlaywright(account: AccountConfig): Promise<CollectResult> {
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const connector = getConnector(account.platform);
      const page = await browser.newPage();

      try {
        const result = normalizeResult(await connector.collectViaPlaywright(account.url, page));
        if (
          result.status === "failed" &&
          attempt === 0 &&
          isTransientPlaywrightError(result.error_code, result.error_message)
        ) {
          continue;
        }
        return result;
      } finally {
        await page.close();
      }
    }

    return {
      followers: null,
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "playwright_retry_exhausted",
      error_message: "Playwright retry exhausted without successful extraction."
    };
  } catch (error) {
    return {
      followers: null,
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "playwright_failed",
      error_message: error instanceof Error ? error.message : "Unable to start Playwright browser"
    };
  } finally {
    await browser?.close();
  }
}

async function collectOne(account: AccountConfig): Promise<CollectResult> {
  const connector = getConnector(account.platform);

  if (!connector.supports(account.url)) {
    return {
      followers: null,
      method: "html",
      confidence: "low",
      status: "failed",
      error_code: "unsupported_url",
      error_message: `URL is not supported for platform ${account.platform}`
    };
  }

  const htmlResult = normalizeResult(await connector.collectViaHtml(account.url));
  if (htmlResult.status === "ok" || htmlResult.error_code === "captcha") {
    return htmlResult;
  }

  return collectWithPlaywright(account);
}

export async function runCollection(options: RunOptions = {}): Promise<void> {
  const source = options.source ?? "cli";
  const db = initDb();
  const accounts = loadAccountsConfig();
  syncAccounts(db, accounts);

  const enabled = accounts.filter((account) => account.enabled);
  const date = bangkokDate();

  console.log(`[collector] start source=${source} date=${date} accounts=${enabled.length}`);

  for (const account of enabled) {
    console.log(`[collector] account=${account.id} platform=${account.platform} start`);
    const startedAt = Date.now();
    const result = await collectOne(account);
    const snapshotInput = {
      account_id: account.id,
      date,
      followers: result.followers,
      method: result.method,
      confidence: result.confidence,
      status: result.status,
      collected_at: nowIso()
    };
    if (result.error_code) {
      Object.assign(snapshotInput, { error_code: result.error_code });
    }
    if (result.error_message) {
      Object.assign(snapshotInput, { error_message: result.error_message });
    }
    if (result.raw_excerpt) {
      Object.assign(snapshotInput, { raw_excerpt: result.raw_excerpt });
    }

    upsertSnapshot(db, snapshotInput);

    const durationMs = Date.now() - startedAt;
    const logCore = `status=${result.status} method=${result.method} followers=${result.followers ?? "null"}`;
    const errorCore = result.error_code ? ` error_code=${result.error_code}` : "";

    console.log(`[collector] account=${account.id} done ${logCore}${errorCore} duration_ms=${durationMs}`);
  }

  db.close();
  console.log("[collector] done");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollection().catch((error) => {
    console.error("[collector] fatal", error);
    process.exitCode = 1;
  });
}
