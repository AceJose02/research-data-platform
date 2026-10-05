import { useRef, useState } from "react";
import { api } from "../api.js";
import { useNotify } from "../hooks/useToasts.jsx";
import { useRequest } from "../hooks/useRequest.js";
import { UploadIcon } from "./Icons.jsx";
import WelcomeBackdrop from "./WelcomeBackdrop.jsx";

const DEFAULT_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".xls"];

export default function Welcome({ health, healthError, onOpen }) {
  const notify = useNotify();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null); // { name, value }
  const [busySample, setBusySample] = useState(null);
  const samples = useRequest((signal) => api.samples({ signal }), [healthError]);

  const extensions = health?.extensions ?? DEFAULT_EXTENSIONS;
  const maxMb = health?.max_upload_mb ?? 50;
  const busy = progress !== null || busySample !== null;

  async function handleFile(file) {
    if (!file || busy) return;
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop().toLowerCase()}` : "";
    if (!extensions.includes(ext)) {
      notify(
        `“${file.name}” isn't a supported file. Use CSV, TSV, or Excel. ` +
          "Google Sheets can be exported from File → Download.",
        { tone: "error" },
      );
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      notify(`“${file.name}” is larger than the ${maxMb} MB limit.`, { tone: "error" });
      return;
    }
    setProgress({ name: file.name, value: 0 });
    try {
      const meta = await api.upload(file, {
        onProgress: (value) => setProgress({ name: file.name, value }),
      });
      onOpen(meta);
    } catch (err) {
      notify(err.message, { tone: "error" });
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openSample(sample) {
    if (busy) return;
    setBusySample(sample.id);
    try {
      onOpen(await api.openSample(sample.id));
    } catch (err) {
      notify(err.message, { tone: "error" });
    } finally {
      setBusySample(null);
    }
  }

  const dropHandlers = {
    onDragEnter: (e) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
  };

  const uploadedPct = progress ? Math.round(progress.value * 100) : 0;

  return (
    <main className="welcome graph-paper">
      <WelcomeBackdrop />
      <div className="welcome-inner">
        <h1>Drop in a dataset and start exploring.</h1>
        <p className="lede">
          Every variable gets a codebook entry, summary statistics, and a distribution chart. Compare
          groups, browse the rows, and export a PDF report.
        </p>

        <div className={`dropzone${dragging ? " is-dragging" : ""}`} {...dropHandlers}>
          {progress ? (
            <div className="progress" role="status" aria-live="polite">
              <div className="progress-label">
                <span>
                  {uploadedPct < 100 ? "Uploading" : "Reading"} {progress.name}
                </span>
                <span>{uploadedPct < 100 ? `${uploadedPct}%` : "Analysing columns…"}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(uploadedPct, 3)}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div className="dropzone-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  <UploadIcon />
                  Choose a file
                </button>
                <p className="drag-hint">or drag it here</p>
              </div>
              <p className="hint">
                CSV, TSV, or Excel (.xlsx, .xls), up to {maxMb} MB. Your file stays on this server
                and is deleted after a day of inactivity.
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={extensions.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {healthError && (
          <p className="server-note" role="alert">
            {healthError.message} Then reload this page.
          </p>
        )}

        {samples.data?.samples?.length > 0 && (
          <section className="samples" aria-labelledby="samples-heading">
            <h2 id="samples-heading">Or open a sample</h2>
            <div className="sample-list">
              {samples.data.samples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="sample"
                  onClick={() => openSample(sample)}
                  disabled={busy}
                  aria-busy={busySample === sample.id}
                >
                  <strong>{busySample === sample.id ? `Opening ${sample.title}…` : sample.title}</strong>
                  <span>{sample.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
