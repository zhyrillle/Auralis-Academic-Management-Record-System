import { useState } from "react";
import "../../styles/charts.css";

const WIDTH = 960;
const HEIGHT = 330;
const PADDING = { top: 24, right: 25, bottom: 56, left: 48 };
export default function GroupedBarChart({
  groups,
  ariaLabel,
  minimum = 65,
  maximum = 100,
  ticks = [70, 75, 80, 85, 90, 95, 100],
  benchmark = 75,
  suffix = "",
}) {
  const [activeBar, setActiveBar] = useState(null);
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const groupWidth = chartWidth / Math.max(groups.length, 1);
  const seriesCount = Math.max(groups[0]?.values.length || 1, 1);
  const barWidth = Math.min(38, (groupWidth - 20) / seriesCount);
  const yFor = (value) =>
    PADDING.top +
    ((maximum - value) / Math.max(maximum - minimum, 1)) *
      (HEIGHT - PADDING.top - PADDING.bottom);

  return (
    <div className="chart-scroll-shell">
      <div
        className="chart-viewport chart-viewport--wide grouped-bar-chart"
        onMouseLeave={() => setActiveBar(null)}
        tabIndex="0"
        role="region"
        aria-label={`${ariaLabel}. Horizontally scrollable chart.`}
      >
      <svg
        className="chart-svg chart-svg--wide"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((value) => (
          <g
            key={value}
            className={value === benchmark ? "chart-benchmark" : ""}
          >
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yFor(value)}
              y2={yFor(value)}
            />
            <text x={PADDING.left - 11} y={yFor(value) + 4} textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        <line
          className="chart-baseline"
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={yFor(minimum)}
          y2={yFor(minimum)}
        />
        {groups.map((group, groupIndex) => {
          const centerX =
            PADDING.left + groupWidth * groupIndex + groupWidth / 2;
          return (
            <g key={group.id}>
              {group.values.map((bar, barIndex) => {
                const x =
                  centerX - (seriesCount * barWidth) / 2 + barIndex * barWidth;
                const safeValue = bar.value <= 0 ? minimum : Math.max(bar.value, minimum);
                const y = yFor(safeValue);
                const barHeight = bar.value <= 0 ? 0 : Math.max(0, yFor(minimum) - y);
                const detail = {
                  ...bar,
                  group: group.label,
                  x: x + barWidth / 2,
                  y,
                };
                const isActive = activeBar?.id === bar.id;
                return (
                  <g key={`${bar.id}-${bar.value}`}>
                    <rect
                      className={`grouped-bar-chart__bar${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                      x={x + 4}
                      y={y}
                      width={barWidth - 8}
                      height={barHeight}
                      rx="6"
                      fill={bar.color}
                      tabIndex="0"
                      role="button"
                      aria-label={`${group.label}, ${bar.label}: ${bar.value}${suffix}${bar.detail ? `, ${bar.detail}` : ""}`}
                      style={{
                        animationDelay: `${groupIndex * 55 + barIndex * 70}ms`,
                      }}
                      onMouseEnter={() => setActiveBar(detail)}
                      onFocus={() => setActiveBar(detail)}
                      onBlur={() => setActiveBar(null)}
                    />
                    <text
                      className={`grouped-bar-chart__value${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                      x={x + barWidth / 2}
                      y={y - 8}
                      textAnchor="middle"
                    >
                      {bar.value}
                    </text>
                  </g>
                );
              })}
              <text
                className="chart-axis-label"
                x={centerX}
                y={HEIGHT - 18}
                textAnchor="middle"
              >
                {group.shortLabel || group.label}
              </text>
            </g>
          );
        })}
      </svg>

        {activeBar && (
          <div
            className="chart-tooltip chart-tooltip--wide"
            style={{
              left: `clamp(76px, ${(activeBar.x / WIDTH) * 100}%, calc(100% - 76px))`,
              top: `clamp(56px, ${(activeBar.y / HEIGHT) * 100}%, calc(100% - 18px))`,
            }}
            role="status"
          >
            <strong>{activeBar.group}</strong>
            <span>
              {activeBar.label} · {activeBar.value}
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
