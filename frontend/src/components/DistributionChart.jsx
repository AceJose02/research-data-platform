import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { categoricalItems } from "../lib/distribution.js";
import { formatCompact, formatCount, formatNumber, formatPct, formatRange, truncate } from "../lib/format.js";

const AXIS_FONT = { fontSize: 12, fontFamily: "var(--sans)" };

export function ChartTip({ active, payload, title, lines }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{title(item)}</strong>
      {lines(item).map((line) => (
        <span key={line} style={{ display: "block" }}>
          {line}
        </span>
      ))}
    </div>
  );
}

const countLine = (item) => [`${formatCount(item.count)} rows, ${formatPct(item.pct)}`];

export default function DistributionChart({ distribution, chartType, sort, colors, animate }) {
  if (!distribution) return null;
  const { type } = distribution;

  if (type === "histogram") return <Histogram distribution={distribution} colors={colors} animate={animate} />;

  if (type === "categorical" || type === "discrete") {
    const items = type === "categorical" ? categoricalItems(distribution, sort) : distribution.items;
    if (chartType === "pie") return <PieView items={items} colors={colors} animate={animate} />;
    if (type === "categorical") return <HorizontalBars items={items} colors={colors} animate={animate} />;
    return <ColumnBars items={items} colors={colors} animate={animate} reference={distribution.reference} />;
  }

  if (type === "timeline") return <ColumnBars items={distribution.items} colors={colors} animate={animate} />;
  return null;
}


/** Label for a vertical reference line, pushed to one side so M and Mdn never collide. */
function RefLabel({ viewBox, value, side, color }) {
  if (!viewBox) return null;
  const x = viewBox.x + (side === "left" ? -5 : 5);
  return (
    <text
      x={x}
      y={viewBox.y - 7}
      textAnchor={side === "left" ? "end" : "start"}
      fill={color}
      fontSize={13}
      fontStyle="italic"
      style={{ fontFamily: "var(--serif)" }}
    >
      {value}
    </text>
  );
}

/**
 * Mean (dashed) and median (solid) lines. Each is drawn over a wider line in the
 * panel colour, so it stays visible over bars as well as the background.
 */
export function referenceLines(ref, colors) {
  const lines = [];
  const meanRight = !(ref.mean < ref.median);
  const specs = [
    { key: "median", value: ref.median, label: "Mdn", color: colors.median, dash: undefined, side: meanRight ? "left" : "right" },
    { key: "mean", value: ref.mean, label: "M", color: colors.mean, dash: "5 4", side: meanRight ? "right" : "left" },
  ];
  for (const spec of specs) {
    if (!Number.isFinite(spec.value)) continue;
    lines.push(
      <ReferenceLine key={`${spec.key}-halo`} x={spec.value} stroke={colors.sheet} strokeWidth={5} ifOverflow="extendDomain" />,
      <ReferenceLine
        key={spec.key}
        x={spec.value}
        stroke={spec.color}
        strokeWidth={spec.key === "mean" ? 2 : 1.5}
        strokeDasharray={spec.dash}
        ifOverflow="extendDomain"
        label={(props) => <RefLabel {...props} value={spec.label} side={spec.side} color={spec.color} />}
      />,
    );
  }
  return lines;
}

/** Text halo so labels stay legible where a reference line crosses them. */
export const haloStyle = (colors) => ({
  ...AXIS_FONT,
  fill: colors.axis,
  stroke: colors.sheet,
  strokeWidth: 4,
  paintOrder: "stroke",
  strokeLinejoin: "round",
});

function Histogram({ distribution, colors, animate }) {
  const items = distribution.items.map((it) => ({ ...it, mid: (it.start + it.end) / 2 }));
  const edges = [items[0].start, ...items.map((it) => it.end)];
  const ref = distribution.reference ?? {};
  const tickEvery = Math.ceil(edges.length / 12);
  const ticks = edges.filter((_, i) => i % tickEvery === 0 || i === edges.length - 1);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={items} margin={{ top: 24, right: 16, bottom: 8, left: 4 }} barCategoryGap={1}>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis
            type="number"
            dataKey="mid"
            domain={[edges[0], edges[edges.length - 1]]}
            ticks={ticks}
            tickFormatter={formatCompact}
            tick={{ ...AXIS_FONT, fill: colors.axis }}
            stroke={colors.axis}
            allowDataOverflow
          />
          <YAxis
            allowDecimals={false}
            tick={{ ...AXIS_FONT, fill: colors.axis }}
            stroke={colors.axis}
            width={48}
            tickFormatter={formatCompact}
          />
          <Tooltip
            cursor={{ fill: colors.grid, opacity: 0.5 }}
            content={
              <ChartTip title={(it) => formatRange(it.start, it.end)} lines={countLine} />
            }
          />
          <Bar
            dataKey="count"
            fill={colors.data}
            activeBar={{ fill: colors.mark }}
            isAnimationActive={animate}
            animationDuration={450}
          />
          {referenceLines(ref, colors)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ColumnBars({ items, colors, animate }) {
  const many = items.length > 14;
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={many ? 360 : 320}>
        <BarChart data={items} margin={{ top: 16, right: 16, bottom: many ? 40 : 8, left: 4 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ ...AXIS_FONT, fill: colors.axis }}
            angle={many ? -35 : 0}
            textAnchor={many ? "end" : "middle"}
            stroke={colors.axis}
            tickFormatter={(v) => truncate(v, 14)}
          />
          <YAxis
            allowDecimals={false}
            tick={{ ...AXIS_FONT, fill: colors.axis }}
            stroke={colors.axis}
            width={48}
            tickFormatter={formatCompact}
          />
          <Tooltip
            cursor={{ fill: colors.grid, opacity: 0.5 }}
            content={<ChartTip title={(it) => it.label} lines={countLine} />}
          />
          <Bar
            dataKey="count"
            fill={colors.data}
            activeBar={{ fill: colors.mark }}
            isAnimationActive={animate}
            animationDuration={450}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalBars({ items, colors, animate }) {
  const longest = Math.max(...items.map((it) => Math.min(it.label.length, 28)));
  const labelWidth = Math.min(Math.max(longest * 7.2 + 12, 64), 220);
  const height = Math.max(items.length * 30 + 36, 120);
  return (
    <div className="chart-wrap" style={{ minHeight: 0 }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          barCategoryGap="22%"
        >
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ ...AXIS_FONT, fill: colors.axis }}
            stroke={colors.axis}
            tickFormatter={formatCompact}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            interval={0}
            tick={{ ...AXIS_FONT, fill: colors.text }}
            stroke={colors.axis}
            tickFormatter={(v) => truncate(v, 28)}
          />
          <Tooltip
            cursor={{ fill: colors.grid, opacity: 0.5 }}
            content={<ChartTip title={(it) => it.label} lines={countLine} />}
          />
          <Bar
            dataKey="count"
            fill={colors.data}
            activeBar={{ fill: colors.mark }}
            isAnimationActive={animate}
            animationDuration={450}
          >
            {items.map((it) => (
              <Cell key={it.label} fill={it.isOther ? colors.other : colors.data} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v) => formatPct(v)}
              style={haloStyle(colors)}
              zIndex={2000}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_SLICES = 8;

function PieView({ items, colors, animate }) {
  let slices = items;
  if (items.length > PIE_SLICES) {
    const head = items.filter((it) => !it.isOther).slice(0, PIE_SLICES - 1);
    const rest = items.filter((it) => !head.includes(it));
    slices = [
      ...head,
      {
        label: `Other (${formatCount(rest.length)})`,
        count: rest.reduce((s, it) => s + it.count, 0),
        pct: rest.reduce((s, it) => s + it.pct, 0),
        isOther: true,
      },
    ];
  }
  const fill = (it, i) => (it.isOther ? colors.other : colors.palette[i % colors.palette.length]);

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={340}>
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="label"
            innerRadius="42%"
            outerRadius="72%"
            paddingAngle={1}
            stroke="none"
            isAnimationActive={animate}
            animationDuration={450}
            label={({ x, y, textAnchor, payload, percent }) =>
              percent >= 0.04 ? (
                <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill={colors.text} style={AXIS_FONT}>
                  {truncate(payload.label, 16)} {formatPct(payload.pct)}
                </text>
              ) : null
            }
            labelLine={false}
            style={{ ...AXIS_FONT }}
          >
            {slices.map((it, i) => (
              <Cell key={it.label} fill={fill(it, i)} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip title={(it) => it.label} lines={countLine} />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="legend-list" style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", listStyle: "none", padding: 0, margin: "4px 0 0", fontSize: 14 }}>
        {slices.map((it, i) => (
          <li key={it.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, background: fill(it, i), display: "inline-block" }} />
            {it.label} <span style={{ color: "var(--ink-3)" }}>{formatNumber(it.pct, 1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
