// Builds the PDF report with jsPDF drawing primitives: real text, vector charts,
// and tables that flow across pages. (The previous version screenshotted the
// page with html2canvas, which clipped scrolled charts and squashed tall pages.)
import { describeComparison, kindLabel } from "./columns.js";
import { categoricalItems } from "./distribution.js";
import { formatCompact, formatCount, formatDate, formatNumber, formatPct, formatRange } from "./format.js";

const PAGE = { w: 595.28, h: 841.89, margin: 48, top: 56, bottom: 56 };
const C = {
  ink: "#1b2a3a",
  ink2: "#465667",
  ink3: "#5e6d7b",
  data: "#1f4e79",
  rule: "#d3dcd8",
  grid: "#e4ebe8",
  pen: "#b42318",
  other: "#a9b6c0",
  head: "#f1f4f3",
  palette: ["#1f4e79", "#5b8fc2", "#a8c7e6", "#c9a227", "#3e7c6b", "#8a6db0", "#b5603c", "#6e7c89"],
};

// Standard PDF fonts only cover Windows-1252; replace anything else.
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfText(value) {
  return Array.from(String(value ?? ""))
    .map((ch) => {
      const code = ch.codePointAt(0);
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch)) return ch;
      if (ch === "≤") return "<=";
      if (ch === "≥") return ">=";
      if (ch === "\t" || ch === "\n") return " ";
      return "?";
    })
    .join("");
}

function niceMax(value) {
  if (!(value > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (value <= m * mag) return m * mag;
  return 10 * mag;
}

/** Axis from 0 with ~4 round steps that just covers `max` (12 → 0, 5, 10, 15). */
function axis(max, count = 4) {
  const step = niceMax((max || 1) / count);
  const top = Math.ceil((max || 1) / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return { top, ticks };
}

class Report {
  constructor(doc, autoTable, filename) {
    this.doc = doc;
    this.autoTable = autoTable;
    this.filename = filename;
    this.y = PAGE.top;
    this.width = PAGE.w - PAGE.margin * 2;
  }

  ensure(height) {
    if (this.y + height > PAGE.h - PAGE.bottom) {
      this.doc.addPage();
      this.y = PAGE.top;
    }
  }

  font(family, style, size, color = C.ink) {
    this.doc.setFont(family, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }

  heading(text, size = 15) {
    this.ensure(size + 40);
    this.font("times", "bold", size);
    this.doc.text(pdfText(text), PAGE.margin, this.y + size);
    this.y += size + 8;
  }

  paragraph(text, { size = 10, color = C.ink2, gap = 6 } = {}) {
    this.font("helvetica", "normal", size, color);
    const lines = this.doc.splitTextToSize(pdfText(text), this.width);
    this.ensure(lines.length * size * 1.35);
    this.doc.text(lines, PAGE.margin, this.y + size);
    this.y += lines.length * size * 1.35 + gap;
  }

  /** Text made of runs, e.g. [{text:"M", italic:true}, {text:" = 7.03"}] in Times. */
  rich(runs, size = 13) {
    this.ensure(size + 8);
    let x = PAGE.margin;
    for (const run of runs) {
      this.font("times", run.italic ? "italic" : "normal", size, run.color ?? C.ink);
      const text = pdfText(run.text);
      this.doc.text(text, x, this.y + size);
      x += this.doc.getTextWidth(text);
    }
    this.y += size + 8;
  }

  rule(gap = 14) {
    this.doc.setDrawColor(C.rule);
    this.doc.setLineWidth(0.75);
    this.doc.line(PAGE.margin, this.y, PAGE.w - PAGE.margin, this.y);
    this.y += gap;
  }

  table(head, body, { columnStyles, fontSize = 8.5 } = {}) {
    this.autoTable(this.doc, {
      head: [head.map(pdfText)],
      body: body.map((row) => row.map(pdfText)),
      startY: this.y,
      margin: { left: PAGE.margin, right: PAGE.margin, top: PAGE.top, bottom: PAGE.bottom },
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize,
        textColor: C.ink,
        cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
        lineColor: C.rule,
        lineWidth: { bottom: 0.5 },
        overflow: "linebreak",
      },
      headStyles: { fontStyle: "bold", fillColor: C.head, lineWidth: { bottom: 0.9 }, lineColor: "#b9c6c0" },
      columnStyles,
      didParseCell: (cell) => {
        const halign = columnStyles?.[cell.column.index]?.halign;
        if (cell.section === "head" && halign) cell.cell.styles.halign = halign;
      },
    });
    this.y = this.doc.lastAutoTable.finalY + 18;
  }

  // -------------------------------------------------------------- charts
  columnChart(items, { height = 190, histogram = false, reference } = {}) {
    const doc = this.doc;
    const many = items.length > 12;
    const labelBand = histogram ? 22 : many ? 52 : 24;
    const refBand = reference ? 14 : 4;
    this.ensure(height + labelBand + refBand + 10);
    const top = this.y + refBand;
    const left = PAGE.margin + 40;
    const plotW = this.width - 40;
    const plotH = height;
    const maxCount = Math.max(...items.map((it) => it.count), 1);
    const { top: yMax, ticks } = axis(maxCount);
    const yScale = (v) => top + plotH - (v / yMax) * plotH;

    this.font("helvetica", "normal", 7.5, C.ink3);
    doc.setLineWidth(0.5);
    for (const t of ticks) {
      const y = yScale(t);
      doc.setDrawColor(C.grid);
      doc.line(left, y, left + plotW, y);
      doc.text(formatCompact(t), left - 6, y + 2.5, { align: "right" });
    }

    const band = plotW / items.length;
    const gap = histogram ? Math.min(0.8, band * 0.1) : band * 0.2;
    doc.setFillColor(C.data);
    items.forEach((it, i) => {
      const h = (it.count / yMax) * plotH;
      if (h > 0) {
        doc.setFillColor(it.isOther ? C.other : C.data);
        doc.rect(left + i * band + gap / 2, top + plotH - h, band - gap, h, "F");
      }
    });

    doc.setDrawColor(C.ink3);
    doc.setLineWidth(0.75);
    doc.line(left, top + plotH, left + plotW, top + plotH);

    this.font("helvetica", "normal", 7.5, C.ink3);
    if (histogram) {
      const edges = [items[0].start, ...items.map((it) => it.end)];
      const every = Math.ceil(edges.length / 10);
      edges.forEach((edge, i) => {
        if (i % every && i !== edges.length - 1) return;
        doc.text(formatCompact(edge), left + i * band, top + plotH + 11, { align: "center" });
      });
      if (reference) {
        const lo = edges[0];
        const hi = edges[edges.length - 1];
        const xOf = (v) => left + ((v - lo) / (hi - lo)) * plotW;
        const meanRight = !(reference.mean < reference.median);
        const lines = [
          { v: reference.median, color: C.ink, dash: [], label: "Mdn", side: meanRight ? "left" : "right" },
          { v: reference.mean, color: C.pen, dash: [3, 2], label: "M", side: meanRight ? "right" : "left" },
        ];
        for (const line of lines) {
          if (!Number.isFinite(line.v)) continue;
          const x = xOf(line.v);
          doc.setDrawColor("#ffffff");
          doc.setLineWidth(3.6);
          doc.line(x, top, x, top + plotH);
          doc.setDrawColor(line.color);
          doc.setLineWidth(1.2);
          doc.setLineDashPattern(line.dash, 0);
          doc.line(x, top, x, top + plotH);
          doc.setLineDashPattern([], 0);
          this.font("times", "italic", 9, line.color);
          // `side` is where the label sits relative to its line, as on screen.
          const right = line.side === "right";
          doc.text(line.label, right ? x + 3 : x - 3, top - 3, { align: right ? "left" : "right" });
        }
      }
    } else {
      items.forEach((it, i) => {
        const x = left + i * band + band / 2;
        const label = pdfText(it.label);
        const short = label.length > 14 ? `${label.slice(0, 13)}…` : label;
        if (many) doc.text(short, x + 2, top + plotH + 8, { angle: 45, align: "right" });
        else doc.text(short, x, top + plotH + 11, { align: "center" });
      });
    }
    this.y = top + plotH + labelBand + 8;
  }

  barList(items, { format = formatNumber, reference } = {}) {
    const doc = this.doc;
    const rowH = 15;
    this.font("helvetica", "normal", 8);
    const longest = Math.max(...items.map((it) => doc.getTextWidth(pdfText(it.label))), 20);
    const labelW = Math.min(longest + 10, 160);
    const valueW = 54;
    const left = PAGE.margin + labelW;
    const plotW = this.width - labelW - valueW;
    const values = items.map((it) => it.value ?? 0);
    const lo = Math.min(0, ...values);
    const hi = axis(Math.max(...values, Number.isFinite(reference) ? reference : 0, 0)).top;
    const xOf = (v) => left + ((v - lo) / (hi - lo)) * plotW;

    // Keep the whole chart on one page so the reference line is continuous.
    this.ensure(rowH * items.length + 18);
    const top = this.y;
    const bottom = top + rowH * items.length;

    if (reference != null && Number.isFinite(reference)) {
      const xr = xOf(reference);
      doc.setDrawColor(C.pen);
      doc.setLineWidth(1);
      doc.setLineDashPattern([3, 2], 0);
      doc.line(xr, top - 2, xr, bottom + 2);
      doc.setLineDashPattern([], 0);
    }

    items.forEach((it, i) => {
      const y = top + i * rowH;
      let label = pdfText(it.label);
      this.font("helvetica", "normal", 8, C.ink);
      while (doc.getTextWidth(label) > labelW - 8 && label.length > 2) label = `${label.slice(0, -2)}…`;
      doc.text(label, left - 6, y + rowH / 2 + 2.8, { align: "right" });
      const x0 = xOf(0);
      const x1 = xOf(it.value ?? 0);
      doc.setFillColor(it.isOther ? C.other : C.data);
      doc.rect(Math.min(x0, x1), y + 2.5, Math.max(Math.abs(x1 - x0), 0.5), rowH - 5, "F");
      this.font("helvetica", "normal", 7.5, C.ink3);
      const text = format(it.value);
      const tx = Math.max(x0, x1) + 4;
      doc.setFillColor("#ffffff");
      doc.rect(tx - 1.5, y + 3, doc.getTextWidth(text) + 3, rowH - 6, "F");
      doc.text(text, tx, y + rowH / 2 + 2.6);
    });

    doc.setDrawColor(C.ink3);
    doc.setLineWidth(0.75);
    doc.line(xOf(0), top, xOf(0), bottom);
    this.y = bottom + 14;
  }

  pie(items) {
    const doc = this.doc;
    const r = 78;
    const size = r * 2 + 16;
    this.ensure(Math.max(size, items.length * 14 + 10));
    const cx = PAGE.margin + r + 4;
    const cy = this.y + r + 6;
    const total = items.reduce((s, it) => s + it.count, 0) || 1;
    let angle = -Math.PI / 2;
    items.forEach((it, i) => {
      const sweep = (it.count / total) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / (Math.PI / 90)));
      const pts = [[cx, cy]];
      for (let s = 0; s <= steps; s += 1) {
        const a = angle + (sweep * s) / steps;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      const rel = pts.slice(1).map((p, k) => [p[0] - pts[k][0], p[1] - pts[k][1]]);
      doc.setFillColor(it.isOther ? C.other : C.palette[i % C.palette.length]);
      doc.lines(rel, cx, cy, [1, 1], "F", true);
      angle += sweep;
    });
    doc.setFillColor("#ffffff");
    doc.circle(cx, cy, r * 0.45, "F");

    let ly = this.y + 10;
    const lx = cx + r + 28;
    items.forEach((it, i) => {
      doc.setFillColor(it.isOther ? C.other : C.palette[i % C.palette.length]);
      doc.rect(lx, ly - 7, 8, 8, "F");
      this.font("helvetica", "normal", 8.5, C.ink);
      doc.text(`${pdfText(it.label)}  ${formatPct((it.count / total) * 100)}`, lx + 14, ly);
      ly += 14;
    });
    this.y += Math.max(size, items.length * 14 + 10) + 8;
  }

  footer() {
    const pages = this.doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      this.doc.setPage(i);
      this.font("helvetica", "normal", 8, C.ink3);
      this.doc.text(pdfText(this.filename), PAGE.margin, PAGE.h - 28);
      this.doc.text(`Page ${i} of ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 28, { align: "right" });
    }
  }
}

// ------------------------------------------------------------------ content
function codebookSummary(col) {
  const s = col.summary ?? {};
  if (col.kind === "numeric" && s.mean != null) {
    const sd = s.std != null ? `, SD = ${formatNumber(s.std)}` : "";
    return `M = ${formatNumber(s.mean)}${sd}, range ${formatNumber(s.min)} to ${formatNumber(s.max)}`;
  }
  if (col.is_identifier) return "All values unique";
  if (col.kind === "text") return `${formatCount(col.unique)} distinct values, mostly unique`;
  if (col.kind === "categorical" && s.mode != null) return `Mode: ${s.mode} (${formatPct(s.mode_pct)})`;
  if (col.kind === "boolean" && s.true_pct != null) return `${formatPct(s.true_pct)} true`;
  if (col.kind === "datetime" && s.min) return `${formatDate(s.min)} to ${formatDate(s.max)}`;
  return "";
}

function resultRuns(col, stats) {
  const v = (label, value, italic = true) => [
    { text: label, italic },
    { text: ` = ${value}` },
  ];
  const sep = { text: ", ", color: C.ink3 };
  if (col.kind === "numeric" && stats.mean != null) {
    return [
      ...v("M", formatNumber(stats.mean)),
      ...(stats.std != null ? [sep, ...v("SD", formatNumber(stats.std))] : []),
      sep,
      ...v("Mdn", formatNumber(stats.median)),
      sep,
      ...v("n", formatCount(stats.valid)),
    ];
  }
  if (col.kind === "boolean" && stats.true_pct != null) {
    return [{ text: `${formatPct(stats.true_pct)} true, ` }, ...v("n", formatCount(stats.valid))];
  }
  if (col.kind === "datetime" && stats.min) {
    return [{ text: `${formatDate(stats.min)} to ${formatDate(stats.max)}, ` }, ...v("n", formatCount(stats.valid))];
  }
  if (stats.mode != null) {
    return [
      { text: `Most common: ${stats.mode} (${formatPct(stats.mode_pct)}), ` },
      ...v("n", formatCount(stats.valid)),
    ];
  }
  return [...v("n", formatCount(stats.valid ?? 0))];
}

function descriptiveRows(col, stats) {
  if (col.kind === "numeric" && stats.mean != null) {
    return [
      ["Mean", formatNumber(stats.mean), "Minimum", formatNumber(stats.min)],
      ["Std. deviation", formatNumber(stats.std), "1st quartile", formatNumber(stats.q1)],
      ["Std. error of mean", formatNumber(stats.sem), "Median", formatNumber(stats.median)],
      ["Skewness", formatNumber(stats.skewness, 2), "3rd quartile", formatNumber(stats.q3)],
      ["Sum", formatNumber(stats.sum), "Maximum", formatNumber(stats.max)],
      ["Valid", formatCount(stats.valid), "Missing", formatCount(stats.missing)],
    ];
  }
  return [
    ["Valid", formatCount(stats.valid), "Missing", formatCount(stats.missing)],
    ["Distinct values", formatCount(stats.unique), "Missing (%)", formatPct(stats.missing_pct)],
  ];
}

function frequencyRows(dist, items) {
  let cumulative = 0;
  return items.map((it) => {
    cumulative += it.pct;
    const label = dist.type === "histogram" ? formatRange(it.start, it.end) : it.label;
    return [label, formatCount(it.count), formatPct(it.pct), formatPct(Math.min(cumulative, 100))];
  });
}

/**
 * sections: { codebook, variable: { col, analysis, chartType, sort } | null,
 *             comparison: { config, data } | null }
 */
export async function buildReport({ dataset, sections }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({ title: `Report: ${dataset.name}`, creator: "Research Data Platform" });
  const r = new Report(doc, autoTable, dataset.name);

  // Title block
  r.font("times", "bold", 24);
  doc.text("Dataset report", PAGE.margin, r.y + 22);
  r.y += 34;
  r.font("helvetica", "bold", 11);
  doc.text(pdfText(dataset.name), PAGE.margin, r.y + 10);
  r.y += 18;
  const sheet = dataset.sheet ? ` Sheet: ${dataset.sheet}.` : "";
  const generated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  r.paragraph(
    `${formatCount(dataset.rows)} rows and ${formatCount(dataset.column_count)} variables.${sheet} Generated ${generated}.`,
    { size: 9.5, color: C.ink3, gap: 10 },
  );
  r.rule(18);

  if (sections.codebook) {
    r.heading("Codebook");
    r.table(
      ["Variable", "Type", "Valid", "Missing", "Distinct", "Summary"],
      dataset.columns.map((c) => [
        c.name,
        kindLabel(c),
        formatCount(c.valid),
        c.missing ? `${formatCount(c.missing)} (${formatPct(c.missing_pct)})` : "0",
        formatCount(c.unique),
        codebookSummary(c),
      ]),
      {
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 96 },
          1: { cellWidth: 100 },
          2: { halign: "right", cellWidth: 36 },
          3: { halign: "right", cellWidth: 54 },
          4: { halign: "right", cellWidth: 44 },
        },
      },
    );
  }

  const variable = sections.variable;
  if (variable) {
    const { col, analysis } = variable;
    const dist = analysis.distribution;
    r.ensure(260);
    r.heading(col.name, 17);
    r.paragraph(kindLabel(col), { size: 9.5, color: C.ink3, gap: 4 });
    r.rich(resultRuns(col, analysis.stats));
    r.y += 4;

    let items = [];
    if (dist.type === "categorical") items = categoricalItems(dist, variable.sort);
    else if (dist.type !== "none") items = dist.items;

    if (items.length) {
      if (variable.chartType === "pie" && (dist.type === "categorical" || dist.type === "discrete")) {
        let slices = items;
        if (items.length > 8) {
          const head = items.filter((it) => !it.isOther).slice(0, 7);
          const rest = items.filter((it) => !head.includes(it));
          slices = [...head, { label: "Other", count: rest.reduce((s, it) => s + it.count, 0), isOther: true }];
        }
        r.pie(slices);
      } else if (dist.type === "categorical") {
        r.barList(
          items.map((it) => ({ ...it, value: it.count })),
          { format: (v) => formatCount(v) },
        );
      } else {
        r.columnChart(items, { histogram: dist.type === "histogram", reference: dist.reference });
      }
      if (dist.missing > 0) {
        r.paragraph(`${formatCount(dist.missing)} missing values are not shown.`, { size: 8.5, color: C.ink3 });
      }
    } else if (dist.note) {
      r.paragraph(dist.note);
    }

    r.ensure(90);
    r.font("times", "bold", 12);
    doc.text("Descriptive statistics", PAGE.margin, r.y + 12);
    r.y += 20;
    r.table(["Statistic", "Value", "Statistic", "Value"], descriptiveRows(col, analysis.stats), {
      columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
    });

    if (items.length) {
      const label = dist.type === "histogram" ? "Range" : dist.type === "timeline" ? "Period" : "Value";
      r.ensure(80);
      r.font("times", "bold", 12);
      doc.text("Frequency table", PAGE.margin, r.y + 12);
      r.y += 20;
      r.table([label, "Count", "Percent", "Cumulative"], frequencyRows(dist, items), {
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
    }
  }

  const comparison = sections.comparison;
  if (comparison?.data?.items?.length) {
    const { config, data } = comparison;
    const isCount = config.agg === "count";
    r.ensure(160);
    r.heading("Compare groups");
    r.paragraph(describeComparison(config) + ".", { gap: 10 });
    r.barList(data.items, { reference: isCount ? null : data.overall });
    if (!isCount && Number.isFinite(data.overall)) {
      r.paragraph(`Dashed line: all rows (${formatNumber(data.overall)}).`, { size: 8.5, color: C.ink3 });
    }
    r.table(
      ["Group", isCount ? "Rows" : "Value", "Rows with a value", "Rows in group"],
      data.items.map((it) => [it.label, formatNumber(it.value), formatCount(it.n), formatCount(it.rows)]),
      { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } },
    );
    if (data.truncated) {
      r.paragraph(`Showing the ${data.items.length} largest of ${formatCount(data.total_groups)} groups.`, {
        size: 8.5,
        color: C.ink3,
      });
    }
  }

  r.footer();
  return doc;
}

export function reportFilename(dataset, variableName) {
  const base = dataset.name.replace(/\.[^.]+$/, "");
  const part = variableName ? `-${variableName}` : "";
  return `${base}${part}-report.pdf`.replace(/[\\/:*?"<>|\s]+/g, "_");
}
