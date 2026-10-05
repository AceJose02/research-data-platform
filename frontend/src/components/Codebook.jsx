import { useMemo, useRef, useState } from "react";
import { kindLabel } from "../lib/columns.js";
import { formatCount } from "../lib/format.js";
import { SearchIcon } from "./Icons.jsx";

export default function Codebook({ columns, selected, onSelect, sheetPicker }) {
  const [filter, setFilter] = useState("");
  const listRef = useRef(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? columns.filter((c) => c.name.toLowerCase().includes(q)) : columns;
  }, [columns, filter]);

  function onKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = visible.findIndex((c) => c.name === selected);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = visible[Math.min(Math.max(index + step, 0), visible.length - 1)];
    if (!next) return;
    onSelect(next.name);
    const buttons = listRef.current?.querySelectorAll("button");
    buttons?.[visible.indexOf(next)]?.focus();
  }

  return (
    <aside className="codebook" aria-label="Variables">
      <div className="codebook-head">
        <h2>
          Codebook <span>{formatCount(columns.length)} variables</span>
        </h2>
        <label className="search">
          <SearchIcon />
          <span className="sr-only">Filter variables</span>
          <input
            className="input"
            type="search"
            placeholder="Filter variables"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      </div>

      <ul className="codebook-list" ref={listRef} onKeyDown={onKeyDown}>
        {visible.map((col) => (
          <li key={col.name}>
            <button
              type="button"
              className="codebook-item"
              aria-current={col.name === selected ? "true" : undefined}
              onClick={() => onSelect(col.name)}
            >
              <span className="codebook-name">{col.name}</span>
              <span className="codebook-meta">
                <span>{kindLabel(col)}</span>
                {col.missing > 0 && (
                  <span className="missing">{formatCount(col.missing)} missing</span>
                )}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="codebook-empty">No variables match “{filter}”.</li>
        )}
      </ul>

      <div className="codebook-mobile">
        {sheetPicker && <div className="mobile-only">{sheetPicker}</div>}
        <label className="field">
          Variable
          <select className="select" value={selected ?? ""} onChange={(e) => onSelect(e.target.value)}>
            {columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name} ({kindLabel(col)})
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}
