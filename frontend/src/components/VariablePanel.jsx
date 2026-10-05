import { useState } from "react";
import { api } from "../api.js";
import { useRequest } from "../hooks/useRequest.js";
import { kindLabel } from "../lib/columns.js";
import { formatCount, formatDate, formatNumber, formatPct, plural } from "../lib/format.js";
import DistributionChart from "./DistributionChart.jsx";

export const TOP_OPTIONS = [
  { value: 5, label: "Top 5" },
  { value: 10, label: "Top 10" },
  { value: 25, label: "Top 25" },
  { value: 0, label: "All" },
];
const BIN_OPTIONS = [null, 5, 10, 20, 30, 50];

export function analysisParams(col, view) {
  const params = { column: col.name };
  if (["categorical", "text", "boolean"].includes(col.kind)) params.top = view.top;
  if (col.kind === "numeric" && !col.discrete && view.bins) params.bins = view.bins;
  return params;
}

export default function VariablePanel({ datasetId, col, view, onViewChange, colors, animate }) {
  const [retry, setRetry] = useState(0);
  const params = analysisParams(col, view);
  const key = JSON.stringify(params);
  const { data, error, loading } = useRequest(
    (signal) => api.analysis(datasetId, params, { signal }),
    [datasetId, key, retry],
  );
  const current = data?.column === col.name ? data : null;
  const dist = current?.distribution;
  const canPie = dist && (dist.type === "categorical" || dist.type === "discrete");
  const set = (patch) => onViewChange({ ...view, ...patch });

  return (
    <section aria-labelledby="variable-heading">
      <div className="variable-head">
        <h1 id="variable-heading">{col.name}</h1>
        <span className="kind-label">{kindLabel(col)}</span>
      </div>

      <ResultsLine col={col} stats={current?.stats} />

      <div className="sheet" style={{ marginTop: 24 }} aria-busy={loading}>
        {loading && <div className="loading-bar" aria-hidden="true" />}
        <div className="sheet-head">
          <h2>
            Distribution
            {dist?.type === "histogram" && <small>{plural(dist.bins, "bin")}</small>}
            {dist?.type === "timeline" && <small>Rows per {dist.unit}</small>}
          </h2>
          <div className="toolbar">
            {dist?.type === "categorical" && (
              <>
                <label className="inline">
                  Show
                  <select
                    className="select"
                    value={view.top}
                    onChange={(e) => set({ top: Number(e.target.value) })}
                  >
                    {TOP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="segmented" role="group" aria-label="Sort order">
                  <button type="button" aria-pressed={view.sort === "count"} onClick={() => set({ sort: "count" })}>
                    Most frequent
                  </button>
                  <button type="button" aria-pressed={view.sort === "label"} onClick={() => set({ sort: "label" })}>
                    A–Z
                  </button>
                </div>
              </>
            )}
            {dist?.type === "histogram" && (
              <label className="inline">
                Bins
                <select
                  className="select"
                  value={view.bins ?? ""}
                  onChange={(e) => set({ bins: e.target.value ? Number(e.target.value) : null })}
                >
                  {BIN_OPTIONS.map((b) => (
                    <option key={b ?? "auto"} value={b ?? ""}>
                      {b ? `About ${b}` : "Automatic"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canPie && (
              <div className="segmented" role="group" aria-label="Chart type">
                <button type="button" aria-pressed={view.chartType === "bar"} onClick={() => set({ chartType: "bar" })}>
                  Bars
                </button>
                <button type="button" aria-pressed={view.chartType === "pie"} onClick={() => set({ chartType: "pie" })}>
                  Pie
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="sheet-body">
          {error && !loading ? (
            <div className="chart-placeholder">
              <div>
                <p style={{ color: "var(--pen)", margin: "0 0 12px" }}>{error.message}</p>
                <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
                  Try again
                </button>
              </div>
            </div>
          ) : !dist ? (
            <div className="chart-placeholder">Calculating the distribution…</div>
          ) : dist.type === "none" ? (
            <div className="chart-placeholder">{dist.note}</div>
          ) : (
            <>
              <DistributionChart
                distribution={dist}
                chartType={canPie ? view.chartType : "bar"}
                sort={view.sort}
                colors={colors}
                animate={animate}
              />
              {dist.type === "histogram" && (
                <p className="legend-inline">
                  <span className="mean">Mean</span>
                  <span className="median">Median</span>
                </p>
              )}
              {dist.missing > 0 && (
                <p className="chart-caption">
                  {formatCount(dist.missing)} missing {dist.missing === 1 ? "value is" : "values are"} not shown.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {current && <Descriptives kind={col.kind} stats={current.stats} />}
    </section>
  );
}

function MissingNote({ valid, missing, pct }) {
  return (
    <>
      <i>n</i> = {formatCount(valid)},{" "}
      {missing > 0 ? (
        <span className="missing">
          {formatCount(missing)} missing ({formatPct(pct)})
        </span>
      ) : (
        "no missing values"
      )}
      .
    </>
  );
}

function ResultsLine({ col, stats }) {
  const s = stats ?? {};
  const sum = col.summary ?? {};
  const valid = s.valid ?? col.valid;
  const missing = s.missing ?? col.missing;
  const missingPct = s.missing_pct ?? col.missing_pct;
  const sub = <MissingNote valid={valid} missing={missing} pct={missingPct} />;

  if (col.kind === "empty" || valid === 0) {
    return (
      <>
        <p className="results">No values recorded</p>
        <p className="results-sub">All {formatCount(missing)} rows are missing.</p>
      </>
    );
  }

  if (col.kind === "numeric") {
    const mean = s.mean ?? sum.mean;
    const sd = s.std ?? sum.std;
    return (
      <>
        <p className="results">
          <i>M</i> = {formatNumber(mean)}
          {sd != null && (
            <>
              <span className="sep">, </span>
              <i>SD</i> = {formatNumber(sd)}
            </>
          )}
          {s.median != null && (
            <>
              <span className="sep">, </span>
              <i>Mdn</i> = {formatNumber(s.median)}
            </>
          )}
        </p>
        <p className="results-sub">
          Ranges from {formatNumber(s.min ?? sum.min)} to {formatNumber(s.max ?? sum.max)}. {sub}
          {col.is_identifier && " Every value is unique, so this is probably an ID number."}
        </p>
      </>
    );
  }

  if (col.kind === "boolean") {
    const pct = s.true_pct ?? sum.true_pct;
    return (
      <>
        <p className="results">
          {formatPct(pct)} true
          {s.true_count != null && (
            <span className="sep">
              , {formatCount(s.true_count)} of {formatCount(valid)}
            </span>
          )}
        </p>
        <p className="results-sub">{sub}</p>
      </>
    );
  }

  if (col.kind === "datetime") {
    return (
      <>
        <p className="results">
          {formatDate(s.min ?? sum.min)} <span className="sep">to</span> {formatDate(s.max ?? sum.max)}
        </p>
        <p className="results-sub">
          {s.span_days != null && `Spans ${formatCount(Math.round(s.span_days))} days. `}
          {sub}
        </p>
      </>
    );
  }

  if (col.is_identifier) {
    return (
      <>
        <p className="results">{formatCount(col.unique)} unique values</p>
        <p className="results-sub">
          Every value is different, so this looks like an identifier. {sub}
        </p>
      </>
    );
  }

  const mode = s.mode ?? sum.mode;
  const modePct = s.mode_pct ?? sum.mode_pct;
  return (
    <>
      <p className="results">
        Most common: {String(mode)}
        <span className="sep">
          , {s.mode_count != null ? `${formatCount(s.mode_count)} of ${formatCount(valid)} ` : ""}(
          {formatPct(modePct)})
        </span>
      </p>
      <p className="results-sub">
        {plural(col.unique, "distinct value")}. {sub}
      </p>
    </>
  );
}

function Descriptives({ kind, stats }) {
  let rows = [];
  if (kind === "numeric" && stats.mean != null) {
    rows = [
      ["Mean", formatNumber(stats.mean)],
      ["Std. deviation", formatNumber(stats.std)],
      ["Std. error of mean", formatNumber(stats.sem)],
      ["Minimum", formatNumber(stats.min)],
      ["1st quartile", formatNumber(stats.q1)],
      ["Median", formatNumber(stats.median)],
      ["3rd quartile", formatNumber(stats.q3)],
      ["Maximum", formatNumber(stats.max)],
      ["Interquartile range", formatNumber(stats.iqr)],
      ["Skewness", formatNumber(stats.skewness, 2)],
      ["Sum", formatNumber(stats.sum)],
      ["Distinct values", formatCount(stats.unique)],
    ];
  } else if ((kind === "categorical" || kind === "text") && stats.mode != null) {
    rows = [
      ["Valid", formatCount(stats.valid)],
      ["Missing", formatCount(stats.missing)],
      ["Distinct values", formatCount(stats.unique)],
      ["Mode", String(stats.mode)],
      ["Mode frequency", formatCount(stats.mode_count)],
    ];
    if (kind === "text") rows.push(["Average length", `${formatNumber(stats.mean_length, 1)} characters`]);
  } else if (kind === "boolean" && stats.true_count != null) {
    rows = [
      ["True", formatCount(stats.true_count)],
      ["False", formatCount(stats.false_count)],
      ["Missing", formatCount(stats.missing)],
    ];
  } else if (kind === "datetime" && stats.min) {
    rows = [
      ["Earliest", formatDate(stats.min, true)],
      ["Median", formatDate(stats.median, true)],
      ["Latest", formatDate(stats.max, true)],
      ["Distinct values", formatCount(stats.unique)],
      ["Missing", formatCount(stats.missing)],
    ];
  }
  if (!rows.length) return null;
  return (
    <dl className="descriptives" aria-label="Descriptive statistics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
