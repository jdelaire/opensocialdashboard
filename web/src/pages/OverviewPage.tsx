import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PlatformIcon } from "../components/PlatformIcon.js";
import { AccountOverviewRow, AccountsResponse } from "../types.js";

function formatDelta(value: number | null): string {
  if (value === null) {
    return "-";
  }
  if (value > 0) {
    return `+${value.toLocaleString()}`;
  }
  return value.toLocaleString();
}

function deltaClass(value: number | null): string {
  if (value === null || value === 0) {
    return "delta-neutral";
  }
  return value > 0 ? "delta-positive" : "delta-negative";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/accounts");
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const payload = (await response.json()) as AccountsResponse;
        if (!cancelled) {
          setData(payload);
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
            <div className="stat-value">{aggregate.totalFollowers.toLocaleString()}</div>
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
            <p className="section-summary">Sorted by 7-day momentum so the strongest movers rise to the top.</p>
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
                <th>Last Status</th>
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
                          <div className="account-secondary">{extractAccountName(row.account.url) ?? row.account.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>{row.latest?.followers?.toLocaleString() ?? "-"}</td>
                    <td className={deltaClass(row.derived.delta_1d)}>{formatDelta(row.derived.delta_1d)}</td>
                    <td className={deltaClass(row.derived.delta_7d)}>{formatDelta(row.derived.delta_7d)}</td>
                    <td>
                      <span className={`status-pill ${statusClass(lastStatus)}`}>{lastStatus}</span>
                      {row.latest?.error_code ? <div className="account-secondary">{row.latest.error_code}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-grid">
        <div>
          <p className="section-kicker">Exceptions</p>
          <h3>Missing Today</h3>
          <ul className="clean-list">
            {(data?.missing_today ?? []).map((row: AccountOverviewRow) => (
              <li key={row.account.id} className="account-list-item">
                <PlatformIcon platform={row.account.platform} className="platform-badge-small" />
                <span>{row.account.label}</span>
              </li>
            ))}
            {(data?.missing_today ?? []).length === 0 && <li>None</li>}
          </ul>
        </div>
        <div>
          <p className="section-kicker">Exceptions</p>
          <h3>Failed Today</h3>
          <ul className="clean-list">
            {(data?.failed_today ?? []).map((row: AccountOverviewRow) => (
              <li key={row.account.id} className="account-list-item">
                <PlatformIcon platform={row.account.platform} className="platform-badge-small" />
                <span>
                  {row.account.label}
                  {row.latest?.error_code ? ` (${row.latest.error_code})` : ""}
                </span>
              </li>
            ))}
            {(data?.failed_today ?? []).length === 0 && <li>None</li>}
          </ul>
        </div>
      </section>
    </main>
  );
}
