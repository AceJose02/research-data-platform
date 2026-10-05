import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Codebook from "./components/Codebook.jsx";
import DataTable from "./components/DataTable.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import GroupComparison from "./components/GroupComparison.jsx";
import Toasts from "./components/Toasts.jsx";
import TopBar, { SheetSelect } from "./components/TopBar.jsx";
import VariablePanel from "./components/VariablePanel.jsx";
import Welcome from "./components/Welcome.jsx";
import { useReducedMotion } from "./hooks/useReducedMotion.js";
import { useRequest } from "./hooks/useRequest.js";
import { useTheme } from "./hooks/useTheme.js";
import { ToastProvider, useNotify } from "./hooks/useToasts.jsx";
import { chartTheme } from "./lib/chartTheme.js";
import { defaultComparison, defaultVariable, followSelection } from "./lib/columns.js";

const DEFAULT_VIEW = { chartType: "bar", sort: "count", top: 10, bins: null };

// The open dataset and variable live in the URL, so a refresh keeps your place.
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  return { datasetId: params.get("dataset"), variable: params.get("variable") };
}

function writeUrl(datasetId, variable) {
  const url = new URL(window.location.href);
  url.search = "";
  if (datasetId) url.searchParams.set("dataset", datasetId);
  if (datasetId && variable) url.searchParams.set("variable", variable);
  window.history.replaceState(null, "", url);
}

function Workbench() {
  const notify = useNotify();
  const [theme, toggleTheme] = useTheme();
  const reducedMotion = useReducedMotion();
  const colors = chartTheme(theme);
  const health = useRequest((signal) => api.health({ signal }), []);

  const [dataset, setDataset] = useState(null);
  const [restoring, setRestoring] = useState(() => Boolean(readUrl().datasetId));
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [comparison, setComparison] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sheetBusy, setSheetBusy] = useState(false);

  const openDataset = useCallback((meta, preferredVariable) => {
    const names = new Set(meta.columns.map((c) => c.name));
    const variable = names.has(preferredVariable) ? preferredVariable : defaultVariable(meta.columns);
    const col = meta.columns.find((c) => c.name === variable);
    setDataset(meta);
    setSelected(variable ?? null);
    setComparison(followSelection(defaultComparison(meta.columns), col, meta.columns));
    setView(DEFAULT_VIEW);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const { datasetId, variable } = readUrl();
    if (!datasetId) return;
    api
      .dataset(datasetId)
      .then((meta) => openDataset(meta, variable))
      .catch((err) => {
        notify(
          err.status === 404 ? "That dataset has expired or was removed. Upload it again." : err.message,
          { tone: "error" },
        );
        writeUrl(null);
      })
      .finally(() => setRestoring(false));
    // Run once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restoring) writeUrl(dataset?.id, selected);
  }, [dataset?.id, selected, restoring]);

  useEffect(() => {
    document.title = dataset ? `${dataset.name} · Research Data Platform` : "Research Data Platform";
  }, [dataset]);

  const columns = dataset?.columns ?? [];
  const col = columns.find((c) => c.name === selected) ?? null;
  const dataKey = dataset ? `${dataset.id}:${dataset.sheet ?? ""}` : "";

  function selectVariable(name) {
    const next = columns.find((c) => c.name === name);
    setSelected(name);
    setView((v) => ({ ...v, bins: null }));
    setComparison((current) => followSelection(current, next, columns));
  }

  async function changeSheet(sheet) {
    setSheetBusy(true);
    try {
      openDataset(await api.setSheet(dataset.id, sheet));
      notify(`Opened sheet “${sheet}”.`);
    } catch (err) {
      notify(err.message, { tone: "error" });
    } finally {
      setSheetBusy(false);
    }
  }

  function startOver() {
    setExportOpen(false);
    setDataset(null);
    setSelected(null);
    setComparison(null);
    writeUrl(null);
  }

  let content;
  if (restoring) {
    content = (
      <main className="welcome graph-paper" aria-busy="true">
        <p className="lede">Opening your dataset…</p>
      </main>
    );
  } else if (dataset) {
    content = (
      <div className="workspace">
        <Codebook
          columns={columns}
          selected={selected}
          onSelect={selectVariable}
          sheetPicker={
            dataset.sheets?.length > 1 ? (
              <SheetSelect dataset={dataset} onSheet={changeSheet} disabled={sheetBusy} />
            ) : null
          }
        />
        <main id="main" className="analysis graph-paper">
          {col && (
            <VariablePanel
              key={`variable:${dataKey}`}
              datasetId={dataset.id}
              col={col}
              view={view}
              onViewChange={setView}
              colors={colors}
              animate={!reducedMotion}
            />
          )}
          <GroupComparison
            key={`compare:${dataKey}`}
            datasetId={dataset.id}
            columns={columns}
            config={comparison}
            onChange={setComparison}
            colors={colors}
            animate={!reducedMotion}
          />
          <DataTable
            key={`rows:${dataKey}`}
            datasetId={dataset.id}
            columns={columns}
            selected={selected}
            totalRows={dataset.rows}
          />
        </main>
      </div>
    );
  } else {
    content = <Welcome health={health.data} healthError={health.error} onOpen={openDataset} />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to analysis
      </a>
      <TopBar
        dataset={dataset}
        theme={theme}
        onToggleTheme={toggleTheme}
        onExport={() => setExportOpen(true)}
        onNew={startOver}
        onSheet={changeSheet}
        sheetBusy={sheetBusy}
      />
      {content}
      {dataset && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          dataset={dataset}
          col={col}
          view={view}
          comparison={comparison}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider render={(toasts, dismiss) => <Toasts toasts={toasts} onDismiss={dismiss} />}>
      <Workbench />
    </ToastProvider>
  );
}
