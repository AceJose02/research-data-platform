const cache = new Map();
function nf(options) {
  const key = JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat("en-US", options));
  return cache.get(key);
}

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Readable precision: 61,800 · 7.03 · 0.125 */
export function formatNumber(value, digits) {
  if (!isNum(value)) return "—";
  const abs = Math.abs(value);
  const max = digits ?? (abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : abs === 0 ? 0 : 3);
  return nf({ maximumFractionDigits: max }).format(value);
}

/** Axis ticks: 40K · 1.2M */
export function formatCompact(value) {
  if (!isNum(value)) return "";
  if (Math.abs(value) < 10000) return formatNumber(value);
  return nf({ notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPct(value, digits = 1) {
  if (!isNum(value)) return "—";
  return `${nf({ maximumFractionDigits: digits }).format(value)}%`;
}

export function formatCount(value) {
  return isNum(value) ? nf({ maximumFractionDigits: 0 }).format(value) : "—";
}

export function plural(n, one, many = `${one}s`) {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const opts = { year: "numeric", month: "short", day: "numeric" };
  // Only show a time when there is one: date-only values arrive as midnight.
  const hasTime = !/T00:00(:00(\.0+)?)?$/.test(String(iso));
  if (withTime && hasTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-US", opts);
}

export function formatRange(start, end) {
  return `${formatCompact(start)}–${formatCompact(end)}`;
}

export function truncate(text, max) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
