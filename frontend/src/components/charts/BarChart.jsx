import { useState } from "react";
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
}) {
  const [activeBar, setActiveBar] = useState(null);
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const drawableHeight = height - PADDING.top - PADDING.bottom;
  const groupWidth = chartWidth / Math.max(data.length, 1);
  const barWidth = Math.min(52, groupWidth * 0.48);
  const gridValues = Array.from({ length: 5 }, (_, index) =>
    Math.round(minimum + ((maximum - minimum) / 4) * index),
  );
  const yFor = (value) =>
    PADDING.top + ((maximum - value) / (maximum - minimum)) * drawableHeight;
  const baseline = yFor(minimum);

  return (
    <div className="chart-scroll-shell">
      <div
        className="chart-viewport bar-chart"
        onMouseLeave={() => setActiveBar(null)}
        tabIndex="0"
        role="region"
        aria-label={`${ariaLabel}. Horizontally scrollable chart.`}
      >
        <svg
          className="chart-svg bar-chart__svg"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={ariaLabel}
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                className="bar-chart__grid"
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
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
            x2={WIDTH - PADDING.right}
            y1={baseline}
            y2={baseline}
          />

          {data.map((item, index) => {
            const centerX = PADDING.left + groupWidth * index + groupWidth / 2;
            const safeValue = item.value <= 0 ? minimum : Math.max(item.value, minimum);
            const y = yFor(safeValue);
            const barHeight = item.value <= 0 ? 0 : Math.max(0, baseline - y);
            const detail = { ...item, x: centerX, y };
            const isActive = activeBar?.id === item.id;
            return (
              <g key={`${item.id}-${item.value}`}>
                <rect
                  className={`bar-chart__bar${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                  x={centerX - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="7"
                  fill={item.color || "#17376d"}
                  tabIndex="0"
                  role="button"
                  aria-label={`${item.label}: ${item.value}${suffix}`}
                  style={{ animationDelay: `${index * 65}ms` }}
                  onMouseEnter={() => setActiveBar(detail)}
                  onFocus={() => setActiveBar(detail)}
                  onBlur={() => setActiveBar(null)}
                />
                <text
                  className="bar-chart__axis-label"
                  x={centerX}
                  y={height - 17}
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
              left: `clamp(65px, ${(activeBar.x / WIDTH) * 100}%, calc(100% - 65px))`,
              top: `clamp(52px, ${(activeBar.y / height) * 100}%, calc(100% - 18px))`,
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
