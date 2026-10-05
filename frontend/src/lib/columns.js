// Column semantics shared across components. Mirrors the backend's rules.

export function kindLabel(col) {
  if (!col) return "";
  if (col.is_identifier) return "Identifier";
  switch (col.kind) {
    case "numeric":
      return col.discrete ? "Numeric, discrete" : "Numeric";
    case "categorical":
      return `Categorical, ${col.unique} ${col.unique === 1 ? "level" : "levels"}`;
    case "text":
      return "Text";
    case "datetime":
      return "Date";
    case "boolean":
      return "Yes / no";
    case "empty":
      return "Empty";
    default:
      return col.kind;
  }
}

export const isMeasure = (col) => col?.kind === "numeric" && !col.is_identifier;

export function isGroupable(col) {
  if (!col || col.is_identifier) return false;
  if (col.kind === "categorical" || col.kind === "boolean") return true;
  return col.kind === "numeric" && col.discrete;
}

export function defaultVariable(columns) {
  return (
    columns.find((c) => isMeasure(c) && !c.discrete) ||
    columns.find((c) => !c.is_identifier && c.kind !== "empty") ||
    columns[0]
  )?.name;
}

export function defaultComparison(columns) {
  const group =
    columns.find((c) => c.kind === "categorical" && !c.is_identifier && c.unique <= 20) ||
    columns.find(isGroupable);
  if (!group) return null;
  const metric = columns.find((c) => isMeasure(c) && !c.discrete && c.name !== group.name);
  return { group_by: group.name, metric: metric?.name ?? null, agg: metric ? "mean" : "count" };
}

/** Keep the comparison pointed at whatever variable is being looked at. */
export function followSelection(comparison, col, columns) {
  if (!col) return comparison;
  const base = comparison ?? defaultComparison(columns);
  if (!base) return base;
  if (isMeasure(col) && !col.discrete && col.name !== base.group_by) {
    return { ...base, metric: col.name, agg: base.agg === "count" ? "mean" : base.agg };
  }
  if (isGroupable(col) && col.name !== base.metric) {
    return { ...base, group_by: col.name };
  }
  return base;
}

export const AGGREGATIONS = [
  { value: "mean", label: "mean" },
  { value: "median", label: "median" },
  { value: "sum", label: "total" },
  { value: "min", label: "minimum" },
  { value: "max", label: "maximum" },
  { value: "count", label: "number of rows" },
];

export function aggLabel(agg) {
  return AGGREGATIONS.find((a) => a.value === agg)?.label ?? agg;
}

export function describeComparison(c) {
  if (!c) return "";
  if (c.agg === "count") return `Number of rows for each ${c.group_by}`;
  const label = aggLabel(c.agg);
  return `${label[0].toUpperCase()}${label.slice(1)} of ${c.metric} for each ${c.group_by}`;
}
