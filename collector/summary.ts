import { loadAccountsConfig } from "./config.js";
import { initDb, listAccounts, listSnapshotsForAccount, syncAccounts } from "./db/index.js";
import { sanitizeSnapshotsForAccount } from "./snapshotTrust.js";
import { Platform, SnapshotRecord } from "./types.js";
import { bangkokDate, bangkokDateMinusDays } from "./utils/time.js";

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

function formatNumber(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString();
}

function formatDelta(value: number | null): string {
  if (value === null) {
    return "-";
  }
  if (value > 0) {
    return `+${value.toLocaleString()}`;
  }
  return value.toLocaleString();
}

function formatPct(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatTrend(
  status: "ok" | "failed" | "missing",
  delta7d: number | null,
  pct7d: number | null,
  errorCode: string | null
): string {
  if (status === "failed") {
    return `failed${errorCode ? ` (${errorCode})` : ""}`;
  }
  if (status === "missing") {
    return "missing";
  }
  if (delta7d === null) {
    return "no-baseline";
  }
  if (delta7d > 0) {
    return `up ${formatDelta(delta7d)} (${formatPct(pct7d)})`;
  }
  if (delta7d < 0) {
    return `down ${formatDelta(delta7d)} (${formatPct(pct7d)})`;
  }
  return "flat 0";
}

function formatAggregateTrend(delta7d: number): string {
  if (delta7d > 0) {
    return `up +${delta7d.toLocaleString()}`;
  }
  if (delta7d < 0) {
    return `down ${delta7d.toLocaleString()}`;
  }
  return "flat 0";
}

function latestSnapshot(snapshotsAsc: SnapshotRecord[]): SnapshotRecord | undefined {
  return snapshotsAsc[snapshotsAsc.length - 1];
}

function previousSnapshot(snapshotsAsc: SnapshotRecord[], latestDate: string): SnapshotRecord | undefined {
  for (let index = snapshotsAsc.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshotsAsc[index];
    if (snapshot && snapshot.date < latestDate) {
      return snapshot;
    }
  }
  return undefined;
}

function snapshotOnOrBefore(snapshotsAsc: SnapshotRecord[], targetDate: string): SnapshotRecord | undefined {
  for (let index = snapshotsAsc.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshotsAsc[index];
    if (snapshot && snapshot.date <= targetDate) {
      return snapshot;
    }
  }
  return undefined;
}

export async function runSummary(): Promise<void> {
  const db = initDb();
  try {
    const configAccounts = loadAccountsConfig();
    syncAccounts(db, configAccounts);

    const today = bangkokDate();
    const accounts = listAccounts(db);

    const rows = accounts.map((account) => {
      const snapshotsAsc = sanitizeSnapshotsForAccount(
        account.platform as Platform,
        listSnapshotsForAccount(db, account.id, 400).reverse()
      );
      const latest = latestSnapshot(snapshotsAsc);
      const previous = latest ? previousSnapshot(snapshotsAsc, latest.date) : undefined;
      const latestDate = latest?.date ?? today;
      const snapshot7d = snapshotOnOrBefore(snapshotsAsc, bangkokDateMinusDays(latestDate, 7));
      const snapshot30d = snapshotOnOrBefore(snapshotsAsc, bangkokDateMinusDays(latestDate, 30));

      const delta_1d = diffFollowers(latest, previous);
      const delta_7d = diffFollowers(latest, snapshot7d);
      const delta_30d = diffFollowers(latest, snapshot30d);
      const pct_7d = pct(delta_7d, snapshot7d?.followers ?? null);

      const missing_today = account.enabled === 1 && (!latest || latest.date !== today);
      const failed_today =
        account.enabled === 1 && !!latest && latest.date === today && latest.status === "failed";
      const status = (latest?.status ?? "missing") as "ok" | "failed" | "missing";

      return {
        id: account.id,
        label: account.label,
        platform: account.platform,
        enabled: account.enabled === 1,
        latest_date: latest?.date ?? "-",
        followers: latest?.followers ?? null,
        delta_1d,
        delta_7d,
        delta_30d,
        pct_7d,
        status,
        error_code: latest?.error_code ?? null,
        missing_today,
        failed_today
      };
    });

    const aggregate = {
      date: today,
      accounts_total: rows.length,
      enabled_accounts: rows.filter((row) => row.enabled).length,
      total_followers: rows.reduce((sum, row) => sum + (row.followers ?? 0), 0),
      total_delta_1d: rows.reduce((sum, row) => sum + (row.delta_1d ?? 0), 0),
      total_delta_7d: rows.reduce((sum, row) => sum + (row.delta_7d ?? 0), 0),
      missing_today: rows.filter((row) => row.missing_today).length,
      failed_today: rows.filter((row) => row.failed_today).length
    };

    console.log("");
    console.log(`Summary ${aggregate.date}`);
    console.log(
      `All Accounts - ${formatNumber(aggregate.total_followers)} - ${formatAggregateTrend(
        aggregate.total_delta_7d
      )} | failed:${aggregate.failed_today} missing:${aggregate.missing_today}`
    );
    for (const row of rows) {
      const followersText = row.followers === null ? "n/a" : formatNumber(row.followers);
      console.log(
        `${row.label} - ${followersText} - ${formatTrend(
          row.status,
          row.delta_7d,
          row.pct_7d,
          row.error_code
        )}`
      );
    }
  } finally {
    db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSummary().catch((error) => {
    console.error("[summary] fatal", error);
    process.exitCode = 1;
  });
}
