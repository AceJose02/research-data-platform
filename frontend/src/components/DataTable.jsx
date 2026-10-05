import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useRequest } from "../hooks/useRequest.js";
import { formatCount } from "../lib/format.js";
import { ChevronLeft, ChevronRight, SearchIcon, SortIcon } from "./Icons.jsx";

const PAGE_SIZES = [25, 50, 100];

export default function DataTable({ datasetId, columns, selected, totalRows }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState({ column: null, order: "asc" });
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);

  // Back to the first page whenever the query or ordering changes.
  useEffect(() => setPage(1), [q, sort.column, sort.order, pageSize, datasetId]);

  const kinds = useMemo(() => Object.fromEntries(columns.map((c) => [c.name, c.kind])), [columns]);

  const { data, error, loading } = useRequest(
    (signal) =>
      api.rows(
        datasetId,
        { page, page_size: pageSize, sort: sort.column, order: sort.column ? sort.order : null, q },
        { signal },
      ),
    [datasetId, page, pageSize, sort.column, sort.order, q],
  );

  function toggleSort(column) {
    setSort((s) => {
      if (s.column !== column) return { column, order: "asc" };
      if (s.order === "asc") return { column, order: "desc" };
      return { column: null, order: "asc" };
    });
  }

  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0;
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0;

  return (
    <section className="sheet" aria-labelledby="data-heading" aria-busy={loading}>
      {loading && <div className="loading-bar" aria-hidden="true" />}
      <div className="sheet-head">
        <h2 id="data-heading">
          Data
          <small>
            {data && q
              ? `${formatCount(data.total)} of ${formatCount(totalRows)} rows match`
              : `${formatCount(totalRows)} rows`}
          </small>
        </h2>
        <label className="search" style={{ width: "min(280px, 100%)" }}>
          <SearchIcon />
          <span className="sr-only">Search rows</span>
          <input
            className="input"
            type="search"
            placeholder="Search rows"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error && !loading ? (
        <p className="table-empty" style={{ color: "var(--pen)" }}>
          {error.message}
        </p>
      ) : data && data.total === 0 ? (
        <p className="table-empty">No rows contain “{q}”.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} aria-label="Dataset rows">
          <table className="data-table">
            <thead>
              <tr>
                <th className="rownum" scope="col">
                  <span className="sr-only">Row number</span>#
                </th>
                {columns.map((col) => {
                  const active = sort.column === col.name;
                  const numeric = kinds[col.name] === "numeric";
                  const classes = [numeric && "num", col.name === selected && "is-selected"]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <th
                      key={col.name}
                      scope="col"
                      className={classes || undefined}
                      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.name)}
                        title={`Sort by ${col.name}`}
                      >
                        {col.name}
                        <SortIcon direction={active ? sort.order : null} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row, r) => (
                <tr key={data.row_numbers[r]}>
                  <td className="rownum">{formatCount(data.row_numbers[r])}</td>
                  {row.map((value, c) => {
                    const name = data.columns[c];
                    const classes = [kinds[name] === "numeric" && "num", name === selected && "is-selected"]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={name} className={classes || undefined} title={value == null ? undefined : String(value)}>
                        {value == null ? <span className="na">NA</span> : String(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-foot">
        <label className="inline field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          Rows per page
          <select className="select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="pager">
          <span aria-live="polite">
            {data ? `Rows ${formatCount(first)}–${formatCount(last)} of ${formatCount(data.total)}` : "Loading rows…"}
          </span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setPage((p) => p - 1)}
            disabled={!data || data.page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data || data.page >= data.pages}
            aria-label="Next page"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
}
