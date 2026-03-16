import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AccountConfig, SnapshotInput, SnapshotRecord } from "../types.js";

const DEFAULT_DB_PATH = path.resolve("data/social-dashboard.db");

export interface AccountRecord {
  id: string;
  platform: string;
  label: string;
  url: string;
  enabled: number;
}

export function initDb(dbPath = DEFAULT_DB_PATH): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(path.resolve("collector/db/schema.sql"), "utf8"));
  const snapshotColumns = db
    .prepare("PRAGMA table_info(snapshots)")
    .all() as Array<{ name: string }>;
  if (!snapshotColumns.some((column) => column.name === "measurement_kind")) {
    db.exec("ALTER TABLE snapshots ADD COLUMN measurement_kind TEXT NOT NULL DEFAULT 'exact'");
  }
  return db;
}

export function syncAccounts(db: Database.Database, accounts: AccountConfig[]): void {
  const upsert = db.prepare(`
    INSERT INTO accounts (id, platform, label, url, enabled)
    VALUES (@id, @platform, @label, @url, @enabled)
    ON CONFLICT(id) DO UPDATE SET
      platform = excluded.platform,
      label = excluded.label,
      url = excluded.url,
      enabled = excluded.enabled
  `);

  const tx = db.transaction((rows: AccountConfig[]) => {
    for (const account of rows) {
      upsert.run({
        ...account,
        enabled: account.enabled ? 1 : 0
      });
    }
  });

  tx(accounts);
}

export function upsertSnapshot(db: Database.Database, snapshot: SnapshotInput): void {
  db.prepare(`
    INSERT INTO snapshots (
      account_id, date, followers, measurement_kind, method, confidence, status,
      error_code, error_message, raw_excerpt, collected_at
    ) VALUES (
      @account_id, @date, @followers, @measurement_kind, @method, @confidence, @status,
      @error_code, @error_message, @raw_excerpt, @collected_at
    )
    ON CONFLICT(account_id, date) DO UPDATE SET
      followers = excluded.followers,
      measurement_kind = excluded.measurement_kind,
      method = excluded.method,
      confidence = excluded.confidence,
      status = excluded.status,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      raw_excerpt = excluded.raw_excerpt,
      collected_at = excluded.collected_at
  `).run({
    ...snapshot,
    raw_excerpt: snapshot.raw_excerpt ?? null,
    error_code: snapshot.error_code ?? null,
    error_message: snapshot.error_message ?? null
  });
}

export function listAccounts(db: Database.Database): AccountRecord[] {
  return db
    .prepare("SELECT id, platform, label, url, enabled FROM accounts ORDER BY platform, label")
    .all() as AccountRecord[];
}

export function getAccountById(db: Database.Database, accountId: string): AccountRecord | undefined {
  return db
    .prepare("SELECT id, platform, label, url, enabled FROM accounts WHERE id = ?")
    .get(accountId) as AccountRecord | undefined;
}

export function listSnapshotsForAccount(
  db: Database.Database,
  accountId: string,
  limitDays = 365
): SnapshotRecord[] {
  return db
    .prepare(
      `SELECT id, account_id, date, followers, measurement_kind, method, confidence, status,
              error_code, error_message, raw_excerpt, collected_at
       FROM snapshots
       WHERE account_id = ?
       ORDER BY date DESC
       LIMIT ?`
    )
    .all(accountId, limitDays) as SnapshotRecord[];
}

export function listSnapshotsForAccountSince(
  db: Database.Database,
  accountId: string,
  startDate: string
): SnapshotRecord[] {
  return db
    .prepare(
      `SELECT id, account_id, date, followers, measurement_kind, method, confidence, status,
              error_code, error_message, raw_excerpt, collected_at
       FROM snapshots
       WHERE account_id = ? AND date >= ?
       ORDER BY date ASC`
    )
    .all(accountId, startDate) as SnapshotRecord[];
}

export function getLatestSnapshot(db: Database.Database, accountId: string): SnapshotRecord | undefined {
  return db
    .prepare(
      `SELECT id, account_id, date, followers, measurement_kind, method, confidence, status,
              error_code, error_message, raw_excerpt, collected_at
       FROM snapshots
       WHERE account_id = ?
       ORDER BY date DESC
       LIMIT 1`
    )
    .get(accountId) as SnapshotRecord | undefined;
}

export function getPreviousSnapshot(
  db: Database.Database,
  accountId: string,
  latestDate: string
): SnapshotRecord | undefined {
  return db
    .prepare(
      `SELECT id, account_id, date, followers, measurement_kind, method, confidence, status,
              error_code, error_message, raw_excerpt, collected_at
       FROM snapshots
       WHERE account_id = ? AND date < ?
       ORDER BY date DESC
       LIMIT 1`
    )
    .get(accountId, latestDate) as SnapshotRecord | undefined;
}

export function getSnapshotOnOrBefore(
  db: Database.Database,
  accountId: string,
  targetDate: string
): SnapshotRecord | undefined {
  return db
    .prepare(
      `SELECT id, account_id, date, followers, measurement_kind, method, confidence, status,
              error_code, error_message, raw_excerpt, collected_at
       FROM snapshots
       WHERE account_id = ? AND date <= ?
       ORDER BY date DESC
       LIMIT 1`
    )
    .get(accountId, targetDate) as SnapshotRecord | undefined;
}
