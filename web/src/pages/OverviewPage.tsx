import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ComparisonCharts } from "../components/ComparisonCharts.js";
import { PlatformIcon } from "../components/PlatformIcon.js";
import { AccountOverviewRow, AccountsResponse, ComparisonResponse } from "../types.js";

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

  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function deltaClass(value: number | null): string {
  if (value === null || value === 0) {
    return "delta-neutral";
  }
  return value > 0 ? "delta-positive" : "delta-negative";
}

function formatFollowerCount(value: number | null, measurementKind: "exact" | "lower_bound" = "exact"): string {
  if (value === null) {
    return "-";
  }
  const rendered = value.toLocaleString();
  return measurementKind === "lower_bound" ? `>=${rendered}` : rendered;
}

function statusClass(status: "ok" | "failed" | "missing"): string {
  if (status === "ok") {
    return "status-ok";
  }
  if (status === "failed") {
    return "status-failed";
  }
  return "status-missing";
}

function extractAccountName(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    const first = parts[0];
    if (!first) {
      return null;
    }

    if (first.startsWith("@")) {
      return first;
    }

    if (parsed.hostname.includes("instagram.com") || parsed.hostname.includes("tiktok.com")) {
      return `@${first}`;
    }

    return first;
  } catch {
    return null;
  }
}

export function OverviewPage(): JSX.Element {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparisonDays, setComparisonDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedInitialComparison = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const [accountsResponse, comparisonResponse] = await Promise.all([
          fetch("/api/accounts"),
          fetch(`/api/comparison?days=${comparisonDays}`)
        ]);

        if (!accountsResponse.ok) {
          throw new Error(`Accounts API returned ${accountsResponse.status}`);
        }

        if (!comparisonResponse.ok) {
          throw new Error(`Comparison API returned ${comparisonResponse.status}`);
        }

        const [accountsPayload, comparisonPayload] = (await Promise.all([
          accountsResponse.json(),
          comparisonResponse.json()
        ])) as [AccountsResponse, ComparisonResponse];

        if (!cancelled) {
          setData(accountsPayload);
          setComparison(comparisonPayload);
          hasLoadedInitialComparison.current = true;
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load accounts");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedInitialComparison.current) {
      return;
    }

    let cancelled = false;

    async function loadComparison(): Promise<void> {
      setComparisonLoading(true);

      try {
        const response = await fetch(`/api/comparison?days=${comparisonDays}`);
        if (!response.ok) {
          throw new Error(`Comparison API returned ${response.status}`);
        }

        const payload = (await response.json()) as ComparisonResponse;
        if (!cancelled) {
          setComparison(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load comparison");
        }
      } finally {
        if (!cancelled) {
          setComparisonLoading(false);
        }
      }
    }

    void loadComparison();

    return () => {
      cancelled = true;
    };
  }, [comparisonDays]);

  const sortedAccounts = useMemo(() => {
    const rows = data?.accounts ?? [];
    return [...rows].sort((a, b) => (b.derived.delta_7d ?? Number.NEGATIVE_INFINITY) - (a.derived.delta_7d ?? Number.NEGATIVE_INFINITY));
  }, [data]);
  const aggregate = useMemo(() => {
    const rows = data?.accounts ?? [];
    const totalFollowers = rows.reduce((sum, row) => sum + (row.latest?.followers ?? 0), 0);
    const totalDelta1d = rows.reduce((sum, row) => sum + (row.derived.delta_1d ?? 0), 0);
    const totalDelta7d = rows.reduce((sum, row) => sum + (row.derived.delta_7d ?? 0), 0);
    const okCount = rows.filter((row) => row.latest?.status === "ok").length;

    return {
      totalFollowers,
      totalFollowersIsLowerBound: rows.some(
        (row) =>
          row.latest?.status === "ok" &&
          row.latest.followers !== null &&
          row.latest.measurement_kind === "lower_bound"
      ),
      totalDelta1d,
      totalDelta7d,
      okCount,
      totalCount: rows.length,
      failedToday: data?.failed_today.length ?? 0,
      missingToday: data?.missing_today.length ?? 0
    };
  }, [data]);

  if (loading) {
    return <p>Loading account overview...</p>;
  }

  if (error) {
    return <p className="error">Failed to load: {error}</p>;
  }

  return (
    <main className="page">
      <section className="panel panel-emphasis">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Overview</p>
            <h2>Network Snapshot</h2>
            <p className="section-summary">A compact read on total audience, short-term momentum, and collection health across every tracked profile.</p>
          </div>
          <div className="section-meta">{data?.date}</div>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Audience</div>
            <div className="stat-value">{formatFollowerCount(aggregate.totalFollowers, aggregate.totalFollowersIsLowerBound ? "lower_bound" : "exact")}</div>
            {aggregate.totalFollowersIsLowerBound ? (
              <div className="stat-support">Includes lower-bound platform counts.</div>
            ) : null}
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily Change</div>
            <div className="stat-value">{formatDelta(aggregate.totalDelta1d)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Weekly Change</div>
            <div className="stat-value">{formatDelta(aggregate.totalDelta7d)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Collection Health</div>
            <div className="stat-value">
              {aggregate.okCount}/{aggregate.totalCount}
            </div>
            <div className="stat-support">
              Failed: {aggregate.failedToday} | Missing: {aggregate.missingToday}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Accounts</p>
            <h2>Leaderboard</h2>
            <p className="section-summary">Sorted by 7-day momentum so the strongest movers rise to the top. Lower-bound counts render as <code>&gt;=</code>.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Latest Followers</th>
                <th>1d Delta</th>
                <th>7d Delta</th>
                <th>7d %</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map((row: AccountOverviewRow) => {
                const lastStatus = row.latest?.status ?? "missing";
                return (
                  <tr key={row.account.id}>
                    <td>
                      <div className="account-cell">
                        <PlatformIcon platform={row.account.platform} />
                        <div className="account-primary">
                          <Link className="account-link" to={`/accounts/${row.account.id}`}>
                            {row.account.label}
                          </Link>
                          <div className="account-secondary account-meta-row">
                            <span>{extractAccountName(row.account.url) ?? row.account.id}</span>
                            <span className={`status-dot ${statusClass(lastStatus)}`} aria-hidden="true" />
                            {lastStatus !== "ok" ? <span className={`inline-status inline-status-${lastStatus}`}>{lastStatus}</span> : null}
                            {row.latest?.error_code && lastStatus !== "ok" ? <span className="inline-error">{row.latest.error_code}</span> : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{formatFollowerCount(row.latest?.followers ?? null, row.latest?.measurement_kind ?? "exact")}</td>
                    <td className={deltaClass(row.derived.delta_1d)}>{formatDelta(row.derived.delta_1d)}</td>
                    <td className={deltaClass(row.derived.delta_7d)}>{formatDelta(row.derived.delta_7d)}</td>
                    <td className={deltaClass(row.derived.pct_7d)}>{formatPct(row.derived.pct_7d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {comparison ? (
        <ComparisonCharts
          data={comparison}
          selectedDays={comparisonDays}
          onSelectDays={setComparisonDays}
          loading={comparisonLoading}
        />
      ) : null}
    </main>
  );
}
