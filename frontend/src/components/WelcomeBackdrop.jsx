// Decorative charts that fill the empty right side of the welcome screen.
// Pure SVG + CSS animations (see .backdrop in styles.css): colours follow the
// theme, it's hidden from assistive tech, and it holds still for anyone who
// prefers reduced motion.

const HIST = Array.from({ length: 14 }, (_, i) => {
  const h = 150 * Math.exp(-(((i - 5.6) / 3.3) ** 2)) + 14 + (i % 3) * 6;
  return { x: 28 + i * 27, h };
});

const LINE = [138, 120, 126, 98, 104, 82, 90, 64, 70, 52, 58, 40];
const LINE_2 = [150, 146, 140, 138, 128, 130, 120, 118, 112, 108, 100, 98];
const lineX = (i) => 34 + i * 26;
const toPath = (ys) => ys.map((y, i) => `${i ? "L" : "M"}${lineX(i)} ${y}`).join(" ");

const HBARS = [0.92, 0.74, 0.61, 0.48, 0.33];

const SCATTER = Array.from({ length: 24 }, (_, i) => {
  const x = 24 + ((i * 37) % 128) + (i % 4) * 3;
  const y = 128 - (x - 24) * 0.62 + (((i * 53) % 29) - 14);
  return { x, y };
});

function Sheet({ x, y, w, h, variant, children }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`bd-float ${variant}`}>
        <rect className="bd-sheet" width={w} height={h} rx="2" />
        {children}
      </g>
    </g>
  );
}

function TitleStub({ width = 110 }) {
  return (
    <>
      <rect className="bd-stub bd-stub-strong" x="20" y="18" width={width} height="9" rx="2" />
      <rect className="bd-stub" x="20" y="34" width={width * 0.55} height="6" rx="2" />
    </>
  );
}

export default function WelcomeBackdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 520 740" preserveAspectRatio="xMidYMin meet" focusable="false">
        {/* Histogram: bars rise and fall in a travelling wave. */}
        <Sheet x={40} y={8} w={440} h={262} variant="a">
          <TitleStub />
          {[95, 140, 185].map((gy) => (
            <line key={gy} className="bd-grid" x1="26" x2="414" y1={gy} y2={gy} />
          ))}
          {HIST.map((b, i) => (
            <rect
              key={b.x}
              className="bd-bar"
              style={{ "--i": i }}
              x={b.x}
              y={232 - b.h}
              width="25"
              height={b.h}
            />
          ))}
          <line className="bd-axis" x1="24" x2="416" y1="232" y2="232" />
          {/* The median label sits left of its line; the mean only drifts to the right of it. */}
          <line className="bd-median" x1="176" x2="176" y1="62" y2="232" />
          <text className="bd-label" x="171" y="72" textAnchor="end">Mdn</text>
          <g className="bd-slide">
            <line className="bd-mean" x1="186" x2="186" y1="62" y2="232" />
            <text className="bd-label bd-label-mean" x="192" y="72">M</text>
          </g>
        </Sheet>

        {/* Line chart: draws itself, holds, then clears. */}
        <Sheet x={150} y={300} w={350} h={214} variant="b">
          <TitleStub width={96} />
          {[80, 115, 150].map((gy) => (
            <line key={gy} className="bd-grid" x1="28" x2="330" y1={gy} y2={gy} />
          ))}
          <path
            className="bd-area"
            d={`${toPath(LINE)} L${lineX(LINE.length - 1)} 182 L${lineX(0)} 182 Z`}
          />
          <path className="bd-line-2 bd-draw slow" d={toPath(LINE_2)} pathLength="1" />
          <path className="bd-line bd-draw" d={toPath(LINE)} pathLength="1" />
          {LINE.map((y, i) => (
            <circle key={i} className="bd-point" style={{ "--i": i }} cx={lineX(i)} cy={y} r="3.2" />
          ))}
          <line className="bd-axis" x1="26" x2="332" y1="182" y2="182" />
        </Sheet>

        {/* Horizontal bars: grow and shrink like a re-sorted comparison. */}
        <Sheet x={10} y={546} w={300} h={176} variant="c">
          <TitleStub width={84} />
          {HBARS.map((v, i) => (
            <g key={i}>
              <rect className="bd-stub" x="20" y={62 + i * 22} width={30 + ((i * 17) % 22)} height="7" rx="2" />
              <rect
                className="bd-hbar"
                style={{ "--i": i }}
                x="78"
                y={58 + i * 22}
                width={v * 196}
                height="14"
              />
            </g>
          ))}
          <line className="bd-mean" x1="208" x2="208" y1="52" y2="168" />
        </Sheet>

        {/* Scatter: points pulse around a fitted line; the sheet zooms in and out. */}
        <Sheet x={332} y={556} w={180} h={168} variant="d">
          <TitleStub width={64} />
          {SCATTER.map((p, i) => (
            <circle key={i} className="bd-dot" style={{ "--i": i }} cx={p.x} cy={p.y + 14} r="3.6" />
          ))}
          <path className="bd-line bd-draw slow" d="M22 146 L160 60" pathLength="1" />
          <line className="bd-axis" x1="18" x2="166" y1="152" y2="152" />
        </Sheet>
      </svg>
    </div>
  );
}
