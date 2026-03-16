import { ResponsiveContainer, Line, LineChart, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ComparisonResponse } from "../types.js";
import { PlatformIcon } from "./PlatformIcon.js";

const COMPARISON_WINDOWS = [30, 90, 180] as const;
const COMPARISON_COLORS = ["#30493f", "#8a6b45", "#68757c", "#9a4d46", "#5b6d59", "#6b5d80", "#9b7d57", "#50606d"];

function formatCompact(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

function formatCompactMeasurement(value: number | null, measurementKind: "exact" | "lower_bound"): string {
  const rendered = formatCompact(value);
  return value !== null && measurementKind === "lower_bound" ? `>=${rendered}` : rendered;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }

  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatTooltipValue(value: number | string | Array<number | string>, mode: "index" | "followers"): string {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (rawValue === null || rawValue === undefined) {
    return "-";
  }

  if (mode === "index") {
    return `${Number(rawValue).toFixed(1)}`;
  }

  return Number(rawValue).toLocaleString();
}

interface ComparisonChartsProps {
  data: ComparisonResponse;
  selectedDays: number;
  onSelectDays: (days: number) => void;
  loading?: boolean;
}

export function ComparisonCharts({ data, selectedDays, onSelectDays, loading = false }: ComparisonChartsProps): JSX.Element {
  const hasSeries = data.series.length > 0;
  const hasLowerBoundSeries = data.series.some((item) => item.latest_measurement_kind === "lower_bound");

  return (
    <section className={loading ? "panel comparison-panel comparison-panel-loading" : "panel comparison-panel"}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">Comparison</p>
          <h2>Cross-Account Charts</h2>
          <p className="section-summary">Compare relative growth and absolute audience size across every tracked account over a shared time window.</p>
        </div>
        <div className="segmented-control" aria-label="Comparison window">
          {COMPARISON_WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              className={days === selectedDays ? "segment-button segment-button-active" : "segment-button"}
              onClick={() => onSelectDays(days)}
              disabled={loading && days === selectedDays}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {!hasSeries ? (
        <p className="account-secondary">Not enough snapshot history yet to compare accounts.</p>
      ) : (
        <>
          <div className="comparison-grid">
            <div className="comparison-card">
              <div className="comparison-card-header">
                <h3>Normalized Growth</h3>
                <p className="account-secondary">Indexed to 100 at each account&apos;s first available point in this window.</p>
              </div>
              <div className="comparison-chart">
                <ResponsiveContainer>
                  <LineChart data={data.points} margin={{ top: 12, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="rgba(147, 137, 122, 0.18)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6d675d" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#6d675d" }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                      tickFormatter={(value: number) => `${Math.round(value)}`}
                    />
                    <Tooltip
                      formatter={(value) => formatTooltipValue(value, "index")}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    {data.series.map((item, index) => (
                      <Line
                        key={item.account_id}
                        type="monotone"
                        dataKey={item.index_key}
                        name={item.label}
                        stroke={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                        strokeWidth={2.2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="comparison-card">
              <div className="comparison-card-header">
                <h3>Audience Size</h3>
                <p className="account-secondary">Shows last known follower count carried across the selected period.</p>
              </div>
              <div className="comparison-chart">
                <ResponsiveContainer>
                  <LineChart data={data.points} margin={{ top: 12, right: 8, bottom: 0, left: -6 }}>
                    <CartesianGrid stroke="rgba(147, 137, 122, 0.18)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6d675d" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#6d675d" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(value: number) => formatCompact(value)}
                    />
                    <Tooltip
                      formatter={(value) => formatTooltipValue(value, "followers")}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    {data.series.map((item, index) => (
                      <Line
                        key={`${item.account_id}-followers`}
                        type="monotone"
                        dataKey={item.followers_key}
                        name={item.label}
                        stroke={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                        strokeWidth={2.2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="comparison-legend">
            {data.series.map((item, index) => (
              <div key={item.account_id} className="comparison-legend-item">
                <span className="comparison-swatch" style={{ backgroundColor: COMPARISON_COLORS[index % COMPARISON_COLORS.length] }} />
                <PlatformIcon platform={item.platform} className="platform-badge-small comparison-platform-badge" />
                <div className="comparison-legend-copy">
                  <div className="comparison-legend-title">{item.label}</div>
                  <div className="account-secondary">
                    {formatCompactMeasurement(item.latest_followers, item.latest_measurement_kind)} current | {formatPercent(item.pct_change)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasLowerBoundSeries ? (
            <p className="account-secondary">Some series include lower-bound values and render as floors rather than exact counts.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
