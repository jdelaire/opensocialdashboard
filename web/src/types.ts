export interface Snapshot {
  id: number;
  account_id: string;
  date: string;
  followers: number | null;
  method: "html" | "playwright";
  confidence: "high" | "medium" | "low";
  status: "ok" | "failed";
  error_code: string | null;
  error_message: string | null;
  raw_excerpt: string | null;
  collected_at: string;
}

export interface AccountOverviewRow {
  account: {
    id: string;
    platform: string;
    label: string;
    url: string;
    enabled: boolean;
  };
  latest?: Snapshot;
  derived: {
    delta_1d: number | null;
    delta_7d: number | null;
    delta_30d: number | null;
    pct_7d: number | null;
  };
  flags: {
    missing_today: boolean;
    failed_today: boolean;
  };
}

export interface AccountsResponse {
  date: string;
  accounts: AccountOverviewRow[];
  missing_today: AccountOverviewRow[];
  failed_today: AccountOverviewRow[];
}

export interface AccountSnapshotsResponse {
  account: {
    id: string;
    platform: string;
    label: string;
    url: string;
    enabled: boolean;
  };
  snapshots: Snapshot[];
  stats: {
    min_followers: number | null;
    max_followers: number | null;
    best_day: { date: string; delta: number } | null;
    worst_day: { date: string; delta: number } | null;
    growth_7d_rate: number | null;
  };
}
