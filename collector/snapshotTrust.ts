import { CollectResult, Platform, SnapshotRecord } from "./types.js";

const INSTAGRAM_WRONG_METRIC_PATTERN = /\b(posts?|following)\b/i;
const TRUST_WINDOW = 7;

interface RejectionReason {
  error_code: string;
  error_message: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const middleValue = sorted[middle];

  if (sorted.length % 2 === 0) {
    const leftValue = sorted[middle - 1];
    if (leftValue === undefined || middleValue === undefined) {
      return 0;
    }
    return (leftValue + middleValue) / 2;
  }

  return middleValue ?? 0;
}

function recentTrustedFollowers(snapshotsAsc: SnapshotRecord[]): number[] {
  return snapshotsAsc
    .filter((snapshot) => snapshot.status === "ok" && snapshot.followers !== null)
    .map((snapshot) => snapshot.followers as number)
    .slice(-TRUST_WINDOW);
}

function rejectionReasonForCandidate(
  platform: Platform,
  followers: number,
  rawExcerpt: string | null | undefined,
  history: number[]
): RejectionReason | null {
  if (platform === "instagram" && rawExcerpt && INSTAGRAM_WRONG_METRIC_PATTERN.test(rawExcerpt)) {
    return {
      error_code: "suspicious_metric_context",
      error_message: "Collected Instagram metric looked like posts/following instead of followers."
    };
  }

  if (platform !== "instagram" || history.length < 3) {
    return null;
  }

  const baseline = median(history);
  if (baseline <= 0) {
    return null;
  }

  const ratio = followers / baseline;
  const absoluteDelta = Math.abs(followers - baseline);
  const minimumDelta = Math.max(100, Math.round(baseline * 0.35));

  if (absoluteDelta >= minimumDelta && (ratio <= 0.4 || ratio >= 2.5)) {
    return {
      error_code: "suspicious_outlier",
      error_message: `Collected Instagram follower count deviated too far from recent history (baseline ${Math.round(
        baseline
      ).toLocaleString()}).`
    };
  }

  return null;
}

function rejectSnapshot(snapshot: SnapshotRecord, reason: RejectionReason): SnapshotRecord {
  return {
    ...snapshot,
    followers: null,
    status: "failed",
    error_code: reason.error_code,
    error_message: reason.error_message
  };
}

export function sanitizeSnapshotsForAccount(
  platform: Platform,
  snapshotsAsc: SnapshotRecord[]
): SnapshotRecord[] {
  const trusted: SnapshotRecord[] = [];

  for (const snapshot of snapshotsAsc) {
    if (snapshot.status !== "ok" || snapshot.followers === null) {
      trusted.push(snapshot);
      continue;
    }

    const reason = rejectionReasonForCandidate(
      platform,
      snapshot.followers,
      snapshot.raw_excerpt,
      recentTrustedFollowers(trusted)
    );

    trusted.push(reason ? rejectSnapshot(snapshot, reason) : snapshot);
  }

  return trusted;
}

export function sanitizeCollectedResult(
  platform: Platform,
  recentSnapshotsAsc: SnapshotRecord[],
  result: CollectResult
): CollectResult {
  if (result.status !== "ok" || result.followers === null) {
    return result;
  }

  const trustedHistory = recentTrustedFollowers(sanitizeSnapshotsForAccount(platform, recentSnapshotsAsc));
  const reason = rejectionReasonForCandidate(platform, result.followers, result.raw_excerpt, trustedHistory);

  if (!reason) {
    return result;
  }

  return {
    ...result,
    followers: null,
    status: "failed",
    error_code: reason.error_code,
    error_message: reason.error_message
  };
}
