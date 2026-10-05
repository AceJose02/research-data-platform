import { CloseIcon } from "./Icons.jsx";

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.tone === "error" ? " is-error" : ""}`}>
          <p>{toast.message}</p>
          <button type="button" className="btn btn-quiet btn-icon" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
