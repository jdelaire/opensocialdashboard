import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlatformIcon } from "../components/PlatformIcon.js";
import { AccountSnapshotsResponse, Snapshot } from "../types.js";

function formatPct(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatFollowerCount(value: number | null, measurementKind: Snapshot["measurement_kind"] = "exact"): string {
  if (value === null) {
    return "-";
  }
  const rendered = value.toLocaleString();
  return measurementKind === "lower_bound" ? `>=${rendered}` : rendered;
}

function statusClass(status: "ok" | "failed"): string {
  return status === "ok" ? "status-ok" : "status-failed";
}

export function AccountPage(): JSX.Element {
  const { id } = useParams();
  const [data, setData] = useState<AccountSnapshotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualFollowers, setManualFollowers] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/accounts/${id}/snapshots?days=365`);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const payload = (await response.json()) as AccountSnapshotsResponse;
        if (!cancelled) {
          setData(payload);
          const latestSnapshot = payload.snapshots[payload.snapshots.length - 1];
          if (latestSnapshot?.status === "ok" && latestSnapshot.followers !== null) {
            setManualFollowers(String(latestSnapshot.followers));
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load snapshots");
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
  }, [id]);

  const chartRows = useMemo(() => {
    return (data?.snapshots ?? []).map((snapshot: Snapshot) => ({
      date: snapshot.date,
      followers: snapshot.followers
    }));
  }, [data]);
  const hasLowerBoundSnapshots = useMemo(
    () => (data?.snapshots ?? []).some((snapshot) => snapshot.measurement_kind === "lower_bound" && snapshot.followers !== null),
    [data]
  );

  if (!id) {
    return <p className="error">Missing account id.</p>;
  }

  if (loading) {
    return <p>Loading account details...</p>;
  }

  if (error) {
    return <p className="error">Failed to load: {error}</p>;
  }

  async function submitManualFollowers(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!id) {
      return;
    }

    const parsed = Number.parseInt(manualFollowers, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setManualError("Enter a non-negative whole number.");
      setManualMessage(null);
      return;
    }

    setSavingManual(true);
    setManualError(null);
    setManualMessage(null);

    try {
      const response = await fetch(`/api/accounts/${id}/manual-followers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ followers: parsed })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `API returned ${response.status}`);
      }

      const refreshed = await fetch(`/api/accounts/${id}/snapshots?days=365`);
      if (!refreshed.ok) {
        throw new Error(`API returned ${refreshed.status}`);
      }

      const payload = (await refreshed.json()) as AccountSnapshotsResponse;
      setData(payload);
      setManualFollowers(String(parsed));
      setManualMessage("Saved today’s follower count manually.");
    } catch (saveError) {
      setManualError(saveError instanceof Error ? saveError.message : "Failed to save manual followers");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <main className="page">
      <section className="panel panel-emphasis">
        <p>
          <Link className="back-link" to="/">
            Back to overview
          </Link>
        </p>
        <div className="section-heading">
          <div>
            <p className="section-kicker">Account Detail</p>
            <div className="account-title-row">
              <PlatformIcon platform={data?.account.platform ?? ""} />
              <h2>{data?.account.label}</h2>
            </div>
          </div>
          <div className="section-meta">365 Day View</div>
        </div>
        <p className="account-secondary">
          {data?.account.platform} |{" "}
          <a href={data?.account.url} target="_blank" rel="noreferrer">
            {data?.account.url}
          </a>
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Manual Override</p>
            <h3>Set Today&apos;s Followers</h3>
          </div>
        </div>
        <form className="manual-form" onSubmit={submitManualFollowers}>
          <label className="manual-form-field">
            <span className="manual-form-label">Followers</span>
            <input
              className="manual-form-input"
              inputMode="numeric"
              pattern="[0-9]*"
              type="text"
              value={manualFollowers}
              onChange={(event) => setManualFollowers(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="735"
            />
          </label>
          <button className="manual-form-button" type="submit" disabled={savingManual}>
            {savingManual ? "Saving..." : "Save Manual Count"}
          </button>
        </form>
        <p className="account-secondary">
          This writes an exact snapshot for today using <code>manual</code> as the collection method.
        </p>
        {manualMessage ? <p className="success-message">{manualMessage}</p> : null}
        {manualError ? <p className="error">{manualError}</p> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Performance</p>
            <h3>Followers Trend</h3>
          </div>
        </div>
        <div className="chart-area">
          <ResponsiveContainer>
            <LineChart data={chartRows}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="followers" stroke="#0f766e" strokeWidth={2} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {hasLowerBoundSnapshots ? (
          <p className="account-secondary">Some points are lower bounds and render as floors rather than exact follower counts.</p>
        ) : null}
      </section>

      <section className="panel panel-grid">
        <div>
          <p className="section-kicker">Breakdown</p>
          <h3>Stats</h3>
          <ul className="clean-list">
            <li>Min Exact Followers: {data?.stats.min_followers?.toLocaleString() ?? "-"}</li>
            <li>Max Exact Followers: {data?.stats.max_followers?.toLocaleString() ?? "-"}</li>
            <li>
              Best Day: {data?.stats.best_day ? `${data.stats.best_day.date} (${data.stats.best_day.delta >= 0 ? "+" : ""}${data.stats.best_day.delta.toLocaleString()})` : "-"}
            </li>
            <li>
              Worst Day: {data?.stats.worst_day ? `${data.stats.worst_day.date} (${data.stats.worst_day.delta.toLocaleString()})` : "-"}
            </li>
            <li>7d Growth Rate: {formatPct(data?.stats.growth_7d_rate ?? null)}</li>
          </ul>
        </div>
        <div>
          <p className="section-kicker">Recent</p>
          <h3>Recent Status</h3>
          <ul className="clean-list">
            {(data?.snapshots ?? []).slice(-5).reverse().map((snapshot: Snapshot) => (
              <li key={snapshot.id}>
                {snapshot.date} - <span className={`status-pill ${statusClass(snapshot.status)}`}>{snapshot.status}</span>
                {snapshot.status === "ok" ? ` ${formatFollowerCount(snapshot.followers, snapshot.measurement_kind)}` : ""}
                {snapshot.error_code ? <span className="account-secondary"> {snapshot.error_code}</span> : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
