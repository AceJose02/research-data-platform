import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { useRequest } from "../hooks/useRequest.js";
import { AGGREGATIONS, aggLabel, isGroupable, isMeasure } from "../lib/columns.js";
import { formatCompact, formatCount, formatNumber, truncate } from "../lib/format.js";
import { ChartTip, haloStyle } from "./DistributionChart.jsx";

const AXIS_FONT = { fontSize: 12, fontFamily: "var(--sans)" };

export function comparisonParams(config) {
  if (!config?.group_by) return null;
  const params = { group_by: config.group_by, agg: config.agg };
  if (config.agg !== "count") params.metric = config.metric;
  if (config.sort) params.sort = config.sort;
  return params;
}

export default function GroupComparison({ datasetId, columns, config, onChange, colors, animate }) {
  const [retry, setRetry] = useState(0);
  const groups = columns.filter(isGroupable);
  const measures = columns.filter((c) => isMeasure(c) && c.name !== config?.group_by);
  const params = comparisonParams(config);
  const ready = params && (config.agg === "count" || config.metric);
  const key = JSON.stringify(params);

  const { data, error, loading } = useRequest(
    (signal) => (ready ? api.aggregate(datasetId, params, { signal }) : null),
    [datasetId, key, retry],
  );

  if (!groups.length) {
    return (
      <section className="sheet" aria-labelledby="compare-heading">
        <div className="sheet-head">
          <h2 id="compare-heading">Compare groups</h2>
        </div>
        <div className="sheet-body">
          <p className="chart-placeholder" style={{ minHeight: 120 }}>
            This dataset has no column with a small set of labels (like city or education level) to
            group by.
          </p>
        </div>
      </section>
    );
  }

  const set = (patch) => onChange({ ...config, ...patch });
  // Without an explicit choice the server picks: natural order for numbers and
  // yes/no groups, highest first otherwise. Show whichever it used.
  const sortShown = config.sort ?? data?.sort ?? "desc";
  const isCount = config.agg === "count";
  const metricLabel = isCount ? "Rows" : `${aggLabel(config.agg)} of ${config.metric}`;
  const items = data?.items ?? [];
  const height = Math.max(items.length * 32 + 40, 140);
  const longest = Math.max(1, ...items.map((it) => Math.min(it.label.length, 28)));
  const labelWidth = Math.min(Math.max(longest * 7.2 + 12, 48), 220);

  return (
    <section className="sheet" aria-labelledby="compare-heading" aria-busy={loading}>
      {loading && <div className="loading-bar" aria-hidden="true" />}
      <div className="sheet-head">
        <h2 id="compare-heading">Compare groups</h2>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Order groups by">
            <button
              type="button"
              aria-pressed={sortShown === "desc"}
              onClick={() => set({ sort: "desc" })}
            >
              Highest first
            </button>
            <button type="button" aria-pressed={sortShown === "label"} onClick={() => set({ sort: "label" })}>
              A–Z
            </button>
          </div>
        </div>
      </div>

      <div className="sheet-body">
        <div className="sentence">
          <span>Show the</span>
          <select
            className="select"
            aria-label="Statistic"
            value={config.agg}
            onChange={(e) => {
              const agg = e.target.value;
              const metric = agg === "count" ? config.metric : config.metric ?? measures[0]?.name ?? null;
              set({ agg, metric });
            }}
          >
            {AGGREGATIONS.filter((a) => a.value === "count" || measures.length).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {!isCount && (
            <>
              <span>of</span>
              <select
                className="select"
                aria-label="Numeric variable"
                value={config.metric ?? ""}
                onChange={(e) => set({ metric: e.target.value })}
              >
                {measures.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span>for each</span>
          <select
            className="select"
            aria-label="Group by"
            value={config.group_by}
            onChange={(e) => {
              const group_by = e.target.value;
              const metric = config.metric === group_by ? measures.find((m) => m.name !== group_by)?.name ?? null : config.metric;
              set({ group_by, metric });
            }}
          >
            {groups.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 18 }}>
          {error && !loading ? (
            <div className="chart-placeholder" style={{ minHeight: 140 }}>
              <div>
                <p style={{ color: "var(--pen)", margin: "0 0 12px" }}>{error.message}</p>
                <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
                  Try again
                </button>
              </div>
            </div>
          ) : !data ? (
            <div className="chart-placeholder" style={{ minHeight: 140 }}>
              {ready ? "Comparing groups…" : "Choose a numeric variable to compare."}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={height}>
                <BarChart
                  data={items}
                  layout="vertical"
                  margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid horizontal={false} stroke={colors.grid} />
                  <XAxis
                    type="number"
                    tick={{ ...AXIS_FONT, fill: colors.axis }}
                    stroke={colors.axis}
                    tickFormatter={formatCompact}
                    domain={[(min) => Math.min(0, min), "auto"]}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={labelWidth}
                    interval={0}
                    tick={{ ...AXIS_FONT, fill: colors.text }}
                    stroke={colors.axis}
                    tickFormatter={(v) => truncate(v, 28)}
                  />
                  <Tooltip
                    cursor={{ fill: colors.grid, opacity: 0.5 }}
                    content={
                      <ChartTip
                        title={(it) => it.label}
                        lines={(it) => [
                          `${metricLabel}: ${formatNumber(it.value)}`,
                          isCount
                            ? null
                            : `Based on ${formatCount(it.n)} of ${formatCount(it.rows)} rows`,
                        ].filter(Boolean)}
                      />
                    }
                  />
                  {!isCount && Number.isFinite(data.overall) && (
                    <ReferenceLine
                      x={data.overall}
                      stroke={colors.mean}
                      strokeDasharray="5 4"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                    />
                  )}
                  <Bar
                    dataKey="value"
                    fill={colors.data}
                    activeBar={{ fill: colors.mark }}
                    isAnimationActive={animate}
                    animationDuration={450}
                  >
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v) => formatNumber(v)}
                      style={haloStyle(colors)}
                      zIndex={2000}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {!isCount && Number.isFinite(data.overall) && (
                <p className="legend-inline">
                  <span className="mean">
                    All rows: {formatNumber(data.overall)}
                  </span>
                </p>
              )}
              {data.truncated && (
                <p className="chart-caption">
                  Showing the {formatCount(items.length)} largest of {formatCount(data.total_groups)} groups.
                </p>
              )}
              {data.missing_groups > 0 && (
                <p className="chart-caption">
                  {formatCount(data.missing_groups)} rows with no {config.group_by} are left out.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
