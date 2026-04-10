import { Browser, BrowserContext, chromium } from "playwright";
import { ensureLocalAuthProfile, hasAuthProfileSource } from "./authProfile.js";
import { loadAccountsConfig } from "./config.js";
import { getConnector } from "./connectors/index.js";
import { initDb, listSnapshotsForAccount, syncAccounts, upsertSnapshot } from "./db/index.js";
import { sanitizeCollectedResult } from "./snapshotTrust.js";
import { AccountConfig, CollectResult } from "./types.js";
import { bangkokDate } from "./utils/time.js";

interface RunOptions {
  source?: "cli" | "api" | "scheduler";
}

const PLAYWRIGHT_MAX_ATTEMPTS = 3;

function nowIso(): string {
  return new Date().toISOString();
}

function isRetryablePlaywrightResult(result: CollectResult): boolean {
  if (result.status === "ok" || result.error_code === "captcha") {
    return false;
  }

  const transientCodes = new Set([
    "extract_failed",
    "playwright_navigation_failed",
    "playwright_failed",
    "timeout",
    "network"
  ]);
  if (result.error_code && transientCodes.has(result.error_code)) {
    return true;
  }

  const haystack = `${result.error_code || ""} ${result.error_message || ""}`.toLowerCase();
  return haystack.includes("timeout") || haystack.includes("net::") || haystack.includes("connection");
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  const delayMs = 1_000 * (attempt + 1);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function exhaustedRetryResult(lastResult: CollectResult, attempts: number): CollectResult {
  const suffix = `Playwright extraction failed after ${attempts} attempts.`;
  return normalizeResult({
    ...lastResult,
    error_message: lastResult.error_message ? `${lastResult.error_message} ${suffix}` : suffix
  });
}

function playwrightLaunchFailureResult(error: unknown): CollectResult {
  return {
    followers: null,
    measurement_kind: "exact",
    method: "playwright",
    confidence: "low",
    status: "failed",
    error_code: "playwright_failed",
    error_message: error instanceof Error ? error.message : "Unable to start Playwright browser"
  };
}

function authProfileFailureResult(error: unknown): CollectResult {
  return {
    followers: null,
    measurement_kind: "exact",
    method: "playwright",
    confidence: "low",
    status: "failed",
    error_code: "auth_profile_unavailable",
    error_message: error instanceof Error ? error.message : "Unable to prepare local auth profile"
  };
}

function normalizeResult(result: CollectResult): CollectResult {
  const normalized: CollectResult = { ...result };
  if (result.raw_excerpt) {
    normalized.raw_excerpt = result.raw_excerpt.slice(0, 200);
  }
  return normalized;
}

function collectManualFollowers(account: AccountConfig): CollectResult | null {
  if (account.manual_followers === undefined) {
    return null;
  }

  return {
    followers: account.manual_followers,
    measurement_kind: "exact",
    method: "manual",
    confidence: "high",
    status: "ok",
    raw_excerpt: `manual_followers: ${account.manual_followers}`
  };
}

function shouldUseConfiguredAuthProfile(account: AccountConfig): boolean {
  return hasAuthProfileSource(account);
}

function platformLabel(platform: AccountConfig["platform"]): string {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "rednote":
      return "RedNote";
    case "youtube":
      return "YouTube";
    case "x":
      return "X";
    default:
      return platform;
  }
}

function normalizeConfiguredAuthResult(account: AccountConfig, result: CollectResult): CollectResult {
  if (!shouldUseConfiguredAuthProfile(account)) {
    return result;
  }

  if (result.status === "ok" && result.measurement_kind === "exact") {
    return result;
  }

  const label = platformLabel(account.platform);
  const excerpt = result.raw_excerpt;
  if (result.status === "ok" && result.measurement_kind === "lower_bound") {
    return {
      followers: null,
      measurement_kind: "exact",
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "auth_required",
      error_message: `Configured ${label} auth profile no longer exposes exact follower data. Refresh the local copied profile.`,
      raw_excerpt: excerpt
    };
  }

  if (result.error_code === "captcha" || result.error_code === "auth_required") {
    return {
      followers: null,
      measurement_kind: "exact",
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "auth_required",
      error_message: `Configured ${label} auth profile is no longer usable. Refresh the local copied profile and sign in again if needed.`,
      raw_excerpt: excerpt
    };
  }

  if (result.error_code === "extract_failed") {
    return {
      followers: null,
      measurement_kind: "exact",
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "auth_required",
      error_message: `Configured ${label} auth profile did not yield exact follower data. Refresh the local copied profile and sign in again if needed.`,
      raw_excerpt: excerpt
    };
  }

  return result;
}

async function runConnectorInContext(
  account: AccountConfig,
  context: BrowserContext,
  attempt: number
): Promise<CollectResult> {
  const connector = getConnector(account.platform);
  const page = await context.newPage();

  try {
    const result = normalizeConfiguredAuthResult(
      account,
      normalizeResult(await connector.collectViaPlaywright(account.url, page))
    );
    if (isRetryablePlaywrightResult(result) && attempt < PLAYWRIGHT_MAX_ATTEMPTS - 1) {
      console.log(
        `[collector] account=${account.id} retry attempt=${attempt + 2}/${PLAYWRIGHT_MAX_ATTEMPTS} error_code=${result.error_code ?? "unknown"}`
      );
      await waitBeforeRetry(attempt);
    }
    return result;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function collectWithPlaywright(account: AccountConfig): Promise<CollectResult> {
  let lastResult: CollectResult | undefined;

  for (let attempt = 0; attempt < PLAYWRIGHT_MAX_ATTEMPTS; attempt += 1) {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      if (shouldUseConfiguredAuthProfile(account)) {
        const localProfilePath = ensureLocalAuthProfile(account);
        context = await chromium.launchPersistentContext(localProfilePath, {
          headless: true,
          locale: "en-US"
        });
      } else {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
          locale: "en-US"
        });
      }
    } catch (error) {
      return shouldUseConfiguredAuthProfile(account)
        ? authProfileFailureResult(error)
        : playwrightLaunchFailureResult(error);
    }

    try {
      const result = await runConnectorInContext(account, context, attempt);
      lastResult = result;
      if (isRetryablePlaywrightResult(result) && attempt < PLAYWRIGHT_MAX_ATTEMPTS - 1) {
        continue;
      }
      return result;
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }

  return exhaustedRetryResult(
    lastResult ?? {
      followers: null,
      measurement_kind: "exact",
      method: "playwright",
      confidence: "low",
      status: "failed",
      error_code: "playwright_retry_exhausted",
      error_message: "Playwright retry exhausted without a result."
    },
    PLAYWRIGHT_MAX_ATTEMPTS
  );
}

async function collectOne(account: AccountConfig): Promise<CollectResult> {
  const manualResult = collectManualFollowers(account);
  if (manualResult) {
    return manualResult;
  }

  const connector = getConnector(account.platform);

  if (!connector.supports(account.url)) {
    return {
      followers: null,
      measurement_kind: "exact",
      method: "html",
      confidence: "low",
      status: "failed",
      error_code: "unsupported_url",
      error_message: `URL is not supported for platform ${account.platform}`
    };
  }

  if (shouldUseConfiguredAuthProfile(account)) {
    return collectWithPlaywright(account);
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
    const recentSnapshotsAsc = listSnapshotsForAccount(db, account.id, 30).reverse();
    const result = sanitizeCollectedResult(
      account.platform,
      recentSnapshotsAsc,
      await collectOne(account)
    );
    const snapshotInput = {
      account_id: account.id,
      date,
      followers: result.followers,
      measurement_kind: result.measurement_kind,
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
    const logCore = `status=${result.status} method=${result.method} followers=${result.followers ?? "null"} measurement_kind=${result.measurement_kind}`;
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
