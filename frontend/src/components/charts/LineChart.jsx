import { useId, useState } from "react";
import "../../styles/charts.css";

const WIDTH = 960;
const HEIGHT = 300;
const PADDING = { top: 24, right: 28, bottom: 42, left: 48 };
const recorded = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export default function LineChart({
  series = [], showArea = false, ariaLabel, labels = [], minimum = 65,
  maximum = 100, ticks, benchmark = 75, selectedIndex, suffix = "",
}) {
  const gradientId = useId().replaceAll(":", "");
  const [activePoint, setActivePoint] = useState(null);
  const categories = labels.length ? labels : (series[0]?.values || []).map((point, index) => point.label || `Item ${index + 1}`);
  const values = series.flatMap(item => item.values.filter(point => recorded(point.value)).map(point => Number(point.value)));
  // Missing terms are gaps. A recorded zero (or a grade below 65) expands the axis.
  const lower = Math.min(minimum, ...values, benchmark ?? minimum);
  const upper = Math.max(maximum, ...values, benchmark ?? maximum);
  const step = upper - lower > 50 ? 10 : 5;
  const grid = [...new Set([lower, upper, benchmark,
    ...(ticks || Array.from({ length: Math.floor((upper - lower) / step) + 1 }, (_, i) => lower + i * step)),
  ].filter(value => value != null && value >= lower && value <= upper))].sort((a, b) => a - b);
  const xFor = index => PADDING.left + index * ((WIDTH - PADDING.left - PADDING.right) / Math.max(categories.length - 1, 1));
  const yFor = value => PADDING.top + ((upper - Number(value)) / Math.max(upper - lower, 1)) * (HEIGHT - PADDING.top - PADDING.bottom);

  return <div className="chart-viewport chart-viewport--wide line-chart">
    <svg className="chart-svg chart-svg--wide" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={series[0]?.color || "#123062"} stopOpacity="0.25" />
        <stop offset="100%" stopColor={series[0]?.color || "#123062"} stopOpacity="0.03" />
      </linearGradient></defs>
      {grid.map(value => <g key={value} className={value === benchmark ? "chart-benchmark" : ""}>
        <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} />
        <text x={PADDING.left - 11} y={yFor(value) + 4} textAnchor="end">{Number(value.toFixed(1))}</text>
      </g>)}
      {selectedIndex !== undefined && <rect className="line-chart__selection" x={xFor(selectedIndex) - 54} y={PADDING.top} width="108" height={HEIGHT - PADDING.top - PADDING.bottom} rx="10" aria-hidden="true" />}
      {categories.map((category, index) => <text key={category} className={`chart-axis-label${selectedIndex === index ? " is-selected" : ""}`} x={xFor(index)} y={HEIGHT - 12} textAnchor="middle">{category}</text>)}
      {series.map((item, seriesIndex) => {
        const segments = [];
        let segment = [];
        item.values.forEach((point, index) => {
          if (recorded(point.value)) segment.push({ ...point, index });
          else if (segment.length) { segments.push(segment); segment = []; }
        });
        if (segment.length) segments.push(segment);
        return <g key={item.id} className="line-chart__series">
          {segments.map((points, segmentIndex) => {
            const coordinates = points.map(point => `${xFor(point.index)},${yFor(point.value)}`).join(" ");
            return <g key={segmentIndex}>
              {showArea && seriesIndex === 0 && points.length > 1 && <polygon points={`${xFor(points[0].index)},${yFor(lower)} ${coordinates} ${xFor(points.at(-1).index)},${yFor(lower)}`} fill={`url(#${gradientId})`} />}
              {points.length > 1 && <polyline className={`line-chart__line${item.dash ? " line-chart__line--patterned" : ""}`} points={coordinates} fill="none" stroke={item.color} strokeWidth={item.lineWidth ?? (series.length > 4 ? 1.5 : 2)} style={item.dash ? { strokeDasharray: item.dash } : undefined} />}
            </g>;
          })}
          {item.values.map((point, index) => {
            if (!recorded(point.value)) return null;
            const detail = { id: `${item.id}-${index}`, label: item.label, category: categories[index], value: point.value, detail: point.detail, x: xFor(index), y: yFor(point.value) };
            const shared = {
              className: `line-chart__point${selectedIndex !== undefined && selectedIndex !== index ? " is-context" : ""}`,
              fill: item.color, tabIndex: 0, role: "button",
              "aria-label": `${detail.label}, ${detail.category}: ${detail.value}${suffix}${detail.detail ? `, ${detail.detail}` : ""}`,
              onMouseEnter: () => setActivePoint(detail), onMouseLeave: () => setActivePoint(null),
              onFocus: () => setActivePoint(detail), onBlur: () => setActivePoint(null),
              onKeyDown: event => { if (event.key === "Escape") setActivePoint(null); },
            };
            return item.marker === "square"
              ? <rect key={detail.id} {...shared} x={detail.x - 4.5} y={detail.y - 4.5} width="9" height="9" rx="1" />
              : item.marker === "diamond"
                ? <path key={detail.id} {...shared} d={`M ${detail.x} ${detail.y - 6} l 6 6 -6 6 -6 -6 Z`} />
                : <circle key={detail.id} {...shared} cx={detail.x} cy={detail.y} r="5" />;
          })}
        </g>;
      })}
    </svg>
    {activePoint && <div className="chart-tooltip chart-tooltip--wide" style={{ left: `clamp(76px, ${(activePoint.x / WIDTH) * 100}%, calc(100% - 76px))`, top: `clamp(56px, ${(activePoint.y / HEIGHT) * 100}%, calc(100% - 18px))` }} role="status">
      <strong>{activePoint.label}</strong><span>{activePoint.category} · {activePoint.value}{suffix}</span>{activePoint.detail && <small>{activePoint.detail}</small>}
    </div>}
  </div>;
}
