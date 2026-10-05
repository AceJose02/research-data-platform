import { formatCount } from "./format.js";

/** Bars for a categorical distribution: apply sort order, then append "Other". */
export function categoricalItems(distribution, sort) {
  const items = distribution.items.map((it) => ({ ...it }));
  if (sort === "label") {
    items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
  }
  if (distribution.other) {
    const n = distribution.other.categories;
    items.push({
      label: `Other (${formatCount(n)} ${n === 1 ? "category" : "categories"})`,
      count: distribution.other.count,
      pct: distribution.other.pct,
      isOther: true,
    });
  }
  return items;
}
