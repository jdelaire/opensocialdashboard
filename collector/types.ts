export type Platform = "instagram" | "tiktok" | "rednote" | "youtube" | "x";

export type CollectMethod = "html" | "playwright";

export type CollectConfidence = "high" | "medium" | "low";

export type CollectStatus = "ok" | "failed";

export type MeasurementKind = "exact" | "lower_bound";

export interface AccountConfig {
  id: string;
  platform: Platform;
  label: string;
  url: string;
  enabled: boolean;
}

export interface CollectResult {
  followers: number | null;
  measurement_kind: MeasurementKind;
  method: CollectMethod;
  confidence: CollectConfidence;
  status: CollectStatus;
  error_code?: string | undefined;
  error_message?: string | undefined;
  raw_excerpt?: string | undefined;
}

export interface SnapshotInput extends CollectResult {
  account_id: string;
  date: string;
  collected_at: string;
}

export interface SnapshotRecord extends SnapshotInput {
  id: number;
}

export interface Connector {
  supports(url: string): boolean;
  collectViaHtml(url: string): Promise<CollectResult>;
  collectViaPlaywright(url: string, page: import("playwright").Page): Promise<CollectResult>;
}
