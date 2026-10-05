import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useNotify } from "../hooks/useToasts.jsx";
import { describeComparison } from "../lib/columns.js";
import { buildReport, reportFilename } from "../lib/pdf.js";
import { CloseIcon } from "./Icons.jsx";
import { comparisonParams } from "./GroupComparison.jsx";
import { analysisParams, TOP_OPTIONS } from "./VariablePanel.jsx";

export default function ExportDialog({ open, onClose, dataset, col, view, comparison }) {
  const ref = useRef(null);
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [include, setInclude] = useState({ codebook: true, variable: true, comparison: true });
  const [top, setTop] = useState(view.top);

  const hasFrequencies = col && ["categorical", "text", "boolean"].includes(col.kind) && !col.is_identifier;
  const canCompare = Boolean(comparison?.group_by && (comparison.agg === "count" || comparison.metric));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setTop(view.top);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, view.top]);

  const toggle = (key) => setInclude((s) => ({ ...s, [key]: !s[key] }));
  const nothingSelected =
    !include.codebook && !(include.variable && col) && !(include.comparison && canCompare);

  async function download() {
    setBusy(true);
    try {
      const wantVariable = include.variable && col;
      const wantComparison = include.comparison && canCompare;
      const [analysis, aggregate] = await Promise.all([
        wantVariable ? api.analysis(dataset.id, analysisParams(col, { ...view, top })) : null,
        wantComparison ? api.aggregate(dataset.id, comparisonParams(comparison)) : null,
      ]);
      const doc = await buildReport({
        dataset,
        sections: {
          codebook: include.codebook,
          variable: wantVariable ? { col, analysis, chartType: view.chartType, sort: view.sort } : null,
          comparison: wantComparison ? { config: comparison, data: aggregate } : null,
        },
      });
      const filename = reportFilename(dataset, wantVariable ? col.name : null);
      doc.save(filename);
      notify(`Downloaded ${filename}`);
      onClose();
    } catch (err) {
      console.error(err);
      notify(err.message || "The report couldn't be created.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="export-title">
      <div className="dialog-head">
        <h2 id="export-title">Export report</h2>
        <button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="dialog-body">
        <p>Choose what goes into the PDF. Charts are drawn as sharp vector graphics.</p>

        <Check
          id="export-codebook"
          checked={include.codebook}
          onChange={() => toggle("codebook")}
          title="Codebook"
          detail={`Type, missing values, and a summary for all ${dataset.column_count} variables.`}
        />

        <Check
          id="export-variable"
          checked={include.variable && Boolean(col)}
          disabled={!col}
          onChange={() => toggle("variable")}
          title={col ? col.name : "Selected variable"}
          detail="Statistics, distribution chart, and frequency table."
        >
          {hasFrequencies && include.variable && (
            <div className="check-extra">
              <label className="inline field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                Frequency table
                <select className="select" value={top} onChange={(e) => setTop(Number(e.target.value))}>
                  {TOP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value ? `${o.label} values` : "All values"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </Check>

        <Check
          id="export-comparison"
          checked={include.comparison && canCompare}
          disabled={!canCompare}
          onChange={() => toggle("comparison")}
          title="Group comparison"
          detail={canCompare ? describeComparison(comparison) : "Set up a comparison first."}
        />
      </div>

      <div className="dialog-foot">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy || nothingSelected}>
          {busy ? "Creating PDF…" : "Download PDF"}
        </button>
      </div>
    </dialog>
  );
}

function Check({ id, checked, disabled, onChange, title, detail, children }) {
  return (
    <div className={`check${disabled ? " is-disabled" : ""}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={`${id}-detail`}
      />
      <label htmlFor={id}>
        <strong>{title}</strong>
      </label>
      <small id={`${id}-detail`}>{detail}</small>
      {children}
    </div>
  );
}
