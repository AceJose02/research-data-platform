import { DownloadIcon, Logo, MoonIcon, PlusIcon, SunIcon } from "./Icons.jsx";
import { formatCount, plural } from "../lib/format.js";

export default function TopBar({ dataset, theme, onToggleTheme, onExport, onNew, onSheet, sheetBusy }) {
  const nextTheme = theme === "paper" ? "blueprint (dark)" : "paper (light)";
  return (
    <header className="topbar">
      <button type="button" className="wordmark" onClick={onNew} title="Start over with a new dataset">
        <Logo />
        <span>Research Data Platform</span>
      </button>

      {dataset && (
        <div className="dataset-label">
          <strong title={dataset.name}>{dataset.name}</strong>
          <span>
            {formatCount(dataset.rows)} rows, {plural(dataset.column_count, "variable")}
          </span>
        </div>
      )}

      {dataset?.sheets?.length > 1 && (
        <SheetSelect dataset={dataset} onSheet={onSheet} disabled={sheetBusy} className="topbar-sheet" />
      )}

      <div className="topbar-actions">
        {dataset && (
          <>
            <button type="button" className="btn btn-primary" onClick={onExport} aria-label="Export report as PDF">
              <DownloadIcon />
              <span className="btn-label">Export report</span>
            </button>
            <button type="button" className="btn" onClick={onNew} aria-label="Open a new dataset">
              <PlusIcon />
              <span className="btn-label">New dataset</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          onClick={onToggleTheme}
          aria-label={`Switch to ${nextTheme} theme`}
          title={`Switch to ${nextTheme} theme`}
        >
          {theme === "paper" ? <MoonIcon /> : <SunIcon />}
        </button>
      </div>
    </header>
  );
}

export function SheetSelect({ dataset, onSheet, disabled, className = "" }) {
  return (
    <label className={`field ${className}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <span className="sr-only">Excel sheet</span>
      <select
        className="select"
        value={dataset.sheet ?? ""}
        onChange={(e) => onSheet(e.target.value)}
        disabled={disabled}
        aria-label="Excel sheet"
      >
        {dataset.sheets.map((name) => (
          <option key={name} value={name}>
            Sheet: {name}
          </option>
        ))}
      </select>
    </label>
  );
}
