import express from "express";
import {
  getAccountById,
  getLatestSnapshot,
  getPreviousSnapshot,
  getSnapshotOnOrBefore,
  initDb,
  listAccounts,
  listSnapshotsForAccount,
  syncAccounts
} from "../collector/db/index.js";
import { loadAccountsConfig } from "../collector/config.js";
import { runCollection } from "../collector/run.js";
import { bangkokDate, bangkokDateMinusDays } from "../collector/utils/time.js";
import { SnapshotRecord } from "../collector/types.js";

const app = express();
const port = Number(process.env.APP_API_PORT || process.env.PORT || 8790);
const autoCollectDisabled = process.env.AUTO_COLLECT_DISABLED === "1";

app.use(express.json());

let activeCollection: Promise<void> | null = null;

function parseAutoCollectIntervalHours(input: string | undefined): number {
  if (!input) {
    return 24;
  }
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }
  return Math.min(parsed, 168);
}

async function triggerCollection(source: "api" | "scheduler"): Promise<{
  ok: boolean;
  started: boolean;
  error?: string;
}> {
  if (activeCollection) {
    return {
      ok: true,
      started: false
    };
  }

  activeCollection = runCollection({ source });
  try {
    await activeCollection;
    return {
      ok: true,
      started: true
    };
  } catch (error) {
    return {
      ok: false,
      started: true,
      error: error instanceof Error ? error.message : "Collection failed"
    };
  } finally {
    activeCollection = null;
  }
}

function startAutoCollectScheduler(): void {
  if (autoCollectDisabled) {
    console.log("[api] auto-collect scheduler disabled via AUTO_COLLECT_DISABLED=1");
    return;
  }

  const intervalHours = parseAutoCollectIntervalHours(process.env.AUTO_COLLECT_INTERVAL_HOURS);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`[api] auto-collect scheduler enabled interval_hours=${intervalHours}`);

  setInterval(() => {
    void triggerCollection("scheduler").then((result) => {
      if (!result.started) {
        console.log("[api] auto-collect skipped (collection already running)");
      } else if (!result.ok) {
        console.error(`[api] auto-collect failed: ${result.error ?? "unknown"}`);
      }
    });
  }, intervalMs);
}

function parseDays(input: string | undefined): number {
  if (!input) {
    return 365;
  }

  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 365;
  }

  return Math.min(parsed, 2000);
}

function diffFollowers(a?: SnapshotRecord, b?: SnapshotRecord): number | null {
  if (!a || !b || a.followers === null || b.followers === null) {
    return null;
  }
  return a.followers - b.followers;
}

function pct(delta: number | null, base: number | null): number | null {
  if (delta === null || base === null || base === 0) {
    return null;
  }
  return delta / base;
}

function computeBestWorst(snapshotsAsc: SnapshotRecord[]): {
  best_day: { date: string; delta: number } | null;
  worst_day: { date: string; delta: number } | null;
} {
  let best: { date: string; delta: number } | null = null;
  let worst: { date: string; delta: number } | null = null;

  for (let index = 1; index < snapshotsAsc.length; index += 1) {
    const prev = snapshotsAsc[index - 1];
    const current = snapshotsAsc[index];

    if (!prev || !current || prev.followers === null || current.followers === null) {
      continue;
    }

    const delta = current.followers - prev.followers;

    if (!best || delta > best.delta) {
      best = { date: current.date, delta };
    }

    if (!worst || delta < worst.delta) {
      worst = { date: current.date, delta };
    }
  }

  return { best_day: best, worst_day: worst };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/accounts", (_req, res) => {
  const db = initDb();
  try {
    const configAccounts = loadAccountsConfig();
    syncAccounts(db, configAccounts);

    const today = bangkokDate();
    const accounts = listAccounts(db);

    const accountRows = accounts.map((account) => {
      const latest = getLatestSnapshot(db, account.id);
      const previous = latest ? getPreviousSnapshot(db, account.id, latest.date) : undefined;

      const latestDate = latest?.date ?? today;
      const snapshot7d = getSnapshotOnOrBefore(db, account.id, bangkokDateMinusDays(latestDate, 7));
      const snapshot30d = getSnapshotOnOrBefore(db, account.id, bangkokDateMinusDays(latestDate, 30));

      const delta_1d = diffFollowers(latest, previous);
      const delta_7d = diffFollowers(latest, snapshot7d);
      const delta_30d = diffFollowers(latest, snapshot30d);
      const pct_7d = pct(delta_7d, snapshot7d?.followers ?? null);

      const shouldTrackToday = account.enabled === 1;
      const missingToday = shouldTrackToday && (!latest || latest.date !== today);
      const failedToday = shouldTrackToday && !!latest && latest.date === today && latest.status === "failed";

      return {
        account: {
          id: account.id,
          platform: account.platform,
          label: account.label,
          url: account.url,
          enabled: account.enabled === 1
        },
        latest,
        derived: {
          delta_1d,
          delta_7d,
          delta_30d,
          pct_7d
        },
        flags: {
          missing_today: missingToday,
          failed_today: failedToday
        }
      };
    });

    res.json({
      date: today,
      accounts: accountRows,
      missing_today: accountRows.filter((row) => row.flags.missing_today),
      failed_today: accountRows.filter((row) => row.flags.failed_today)
    });
  } finally {
    db.close();
  }
});

app.get("/api/accounts/:id/snapshots", (req, res) => {
  const db = initDb();
  try {
    const accountId = req.params.id;
    const days = parseDays(req.query.days as string | undefined);
    const account = getAccountById(db, accountId);

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const snapshotsDesc = listSnapshotsForAccount(db, accountId, days);
    const snapshotsAsc = [...snapshotsDesc].reverse();

    const validFollowers = snapshotsAsc
      .map((snapshot) => snapshot.followers)
      .filter((value): value is number => value !== null);

    const min_followers = validFollowers.length ? Math.min(...validFollowers) : null;
    const max_followers = validFollowers.length ? Math.max(...validFollowers) : null;

    const { best_day, worst_day } = computeBestWorst(snapshotsAsc);

    const latest = snapshotsAsc[snapshotsAsc.length - 1];
    const base7 = latest ? getSnapshotOnOrBefore(db, accountId, bangkokDateMinusDays(latest.date, 7)) : undefined;
    const delta7 = diffFollowers(latest, base7);
    const growth_7d_rate = pct(delta7, base7?.followers ?? null);

    res.json({
      account: {
        id: account.id,
        platform: account.platform,
        label: account.label,
        url: account.url,
        enabled: account.enabled === 1
      },
      snapshots: snapshotsAsc,
      stats: {
        min_followers,
        max_followers,
        best_day,
        worst_day,
        growth_7d_rate
      }
    });
  } finally {
    db.close();
  }
});

app.post("/api/collect/run", async (_req, res) => {
  const result = await triggerCollection("api");

  if (!result.started) {
    res.status(409).json({
      ok: false,
      error: "Collection already running"
    });
    return;
  }

  if (!result.ok) {
    res.status(500).json({
      ok: false,
      error: result.error ?? "Collection failed"
    });
    return;
  }

  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
  startAutoCollectScheduler();
});
