import { useEffect, useRef, useState } from "react";
import "../../styles/charts.css";

const WIDTH = 760;
const PADDING = { top: 25, right: 22, bottom: 48, left: 48 };

export default function BarChart({
  data,
  ariaLabel,
  minimum = 0,
  maximum = 100,
  suffix = "",
  height = 280,
  fillContainer = false,
  hoverColor,
}) {
  const [activeBar, setActiveBar] = useState(null);
  const viewport = useRef(null);
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!fillContainer || !viewport.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height: measuredHeight } = entry.contentRect;
      setSize({ width: Math.max(520, Math.round(width)), height: Math.max(300, Math.round(measuredHeight)) });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [fillContainer]);
  const width = fillContainer && size ? size.width : WIDTH;
  const plotHeight = fillContainer && size ? size.height : height;
  const recordedValues = data.filter(item => item.value != null && item.value !== "" && Number.isFinite(Number(item.value))).map(item => Number(item.value));
  const lower = Math.min(minimum, ...recordedValues);
  const upper = Math.max(maximum, ...recordedValues);
  const chartWidth = width - PADDING.left - PADDING.right;
  const drawableHeight = plotHeight - PADDING.top - PADDING.bottom;
  const groupWidth = chartWidth / Math.max(data.length, 1);
  const barWidth = Math.min(52, groupWidth * 0.48);
  const gridValues = Array.from({ length: 5 }, (_, index) =>
    Math.round(lower + ((upper - lower) / 4) * index),
  );
  const yFor = (value) =>
    PADDING.top + ((upper - value) / Math.max(upper - lower, 1)) * drawableHeight;
  const baseline = yFor(lower);

  return (
    <div className={`chart-scroll-shell${fillContainer ? " chart-scroll-shell--fill" : ""}`}>
      <div
        ref={viewport}
        className="chart-viewport bar-chart"
        onMouseLeave={() => setActiveBar(null)}
        tabIndex="0"
        role="region"
        aria-label={`${ariaLabel}. Horizontally scrollable chart.`}
      >
        <svg
          className="chart-svg bar-chart__svg"
          viewBox={`0 0 ${width} ${plotHeight}`}
          role="img"
          aria-label={ariaLabel}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                className="bar-chart__grid"
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={yFor(value)}
                y2={yFor(value)}
              />
              <text
                className="bar-chart__tick"
                x={PADDING.left - 10}
                y={yFor(value) + 4}
                textAnchor="end"
              >
                {value}
              </text>
            </g>
          ))}
          <line
            className="bar-chart__baseline"
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={baseline}
            y2={baseline}
          />

          {data.map((item, index) => {
            const centerX = PADDING.left + groupWidth * index + groupWidth / 2;
            const isRecorded = item.value != null && item.value !== "" && Number.isFinite(Number(item.value));
            const safeValue = isRecorded ? Number(item.value) : lower;
            const y = yFor(safeValue);
            const barHeight = isRecorded ? Math.max(0, baseline - y) : 0;
            const detail = { ...item, x: centerX, y };
            const isActive = activeBar?.id === item.id;
            return (
              <g key={`${item.id}-${item.value}`}>
                {isRecorded && <rect
                  className={`bar-chart__bar${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                  x={centerX - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="7"
                  fill={isActive && hoverColor ? hoverColor : item.color || "#123062"}
                  tabIndex="0"
                  role="button"
                  aria-label={`${item.label}: ${item.value}${suffix}`}
                  style={{ animationDelay: `${index * 65}ms` }}
                  onMouseEnter={() => setActiveBar(detail)}
                  onFocus={() => setActiveBar(detail)}
                  onBlur={() => setActiveBar(null)}
                  onKeyDown={event => { if (event.key === "Escape") setActiveBar(null); }}
                />}
                <text
                  className="bar-chart__axis-label"
                  x={centerX}
                  y={plotHeight - 17}
                  textAnchor="middle"
                >
                  {item.shortLabel || item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {activeBar && (
          <div
            className="chart-tooltip chart-tooltip--compact"
            style={{
              left: `clamp(65px, ${(activeBar.x / width) * 100}%, calc(100% - 65px))`,
              top: `clamp(52px, ${(activeBar.y / plotHeight) * 100}%, calc(100% - 18px))`,
            }}
            role="status"
          >
            <strong>{activeBar.label}</strong>
            <span>
              {activeBar.value}
              {suffix}
            </span>
            {activeBar.detail && <small>{activeBar.detail}</small>}
          </div>
        )}
      </div>
      <span className="chart-scroll-hint" aria-hidden="true">
        Swipe or scroll to view all categories
      </span>
    </div>
  );
}
