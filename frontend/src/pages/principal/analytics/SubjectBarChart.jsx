import { useState } from "react";

const WIDTH = 960;
const HEIGHT = 330;
const PADDING = { top: 24, right: 25, bottom: 56, left: 48 };
const Y_MIN = 65;
const Y_MAX = 100;

const yFor = (value) =>
  PADDING.top +
  ((Y_MAX - value) / (Y_MAX - Y_MIN)) *
    (HEIGHT - PADDING.top - PADDING.bottom);

export default function SubjectBarChart({ groups, ariaLabel }) {
  const [activeBar, setActiveBar] = useState(null);
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const groupWidth = chartWidth / Math.max(groups.length, 1);
  const seriesCount = Math.max(groups[0]?.values.length || 1, 1);
  const barWidth = Math.min(38, (groupWidth - 20) / seriesCount);

  return (
    <div
      className="pa-chart__viewport pa-chart__viewport--bars"
      onMouseLeave={() => setActiveBar(null)}
    >
      <svg className="pa-chart__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
        {[70, 75, 80, 85, 90, 95, 100].map((value) => (
          <g key={value} className={value === 75 ? "pa-chart__benchmark" : ""}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} />
            <text x={PADDING.left - 11} y={yFor(value) + 4} textAnchor="end">{value}</text>
          </g>
        ))}
        <line
          className="pa-chart__bar-baseline"
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={yFor(Y_MIN)}
          y2={yFor(Y_MIN)}
        />
        {groups.map((group, groupIndex) => {
          const centerX = PADDING.left + groupWidth * groupIndex + groupWidth / 2;
          return (
            <g key={group.id}>
              {group.values.map((bar, barIndex) => {
                const x = centerX - (seriesCount * barWidth) / 2 + barIndex * barWidth;
                const y = yFor(bar.value);
                const detail = { ...bar, group: group.label, x: x + barWidth / 2, y };
                const isActive = activeBar?.id === bar.id;
                return (
                  <g key={`${bar.id}-${bar.value}`}>
                    <rect
                      className={`pa-chart__bar${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                      x={x + 4}
                      y={y}
                      width={barWidth - 8}
                      height={yFor(Y_MIN) - y}
                      rx="6"
                      fill={bar.color}
                      tabIndex="0"
                      role="button"
                      aria-label={`${group.label}, ${bar.label}: ${bar.value} average grade`}
                      style={{ animationDelay: `${groupIndex * 55 + barIndex * 70}ms` }}
                      onMouseEnter={() => setActiveBar(detail)}
                      onFocus={() => setActiveBar(detail)}
                      onBlur={() => setActiveBar(null)}
                    />
                    <text
                      className={`pa-chart__bar-value${isActive ? " is-active" : activeBar ? " is-muted" : ""}`}
                      x={x + barWidth / 2}
                      y={y - 8}
                      textAnchor="middle"
                    >
                      {bar.value}
                    </text>
                  </g>
                );
              })}
              <text className="pa-chart__axis-label" x={centerX} y={HEIGHT - 18} textAnchor="middle">
                {group.shortLabel || group.label}
              </text>
            </g>
          );
        })}
      </svg>

      {activeBar && (
        <div
          className="pa-chart-tooltip"
          style={{ left: `${(activeBar.x / WIDTH) * 100}%`, top: `${(activeBar.y / HEIGHT) * 100}%` }}
          role="status"
        >
          <strong>{activeBar.group}</strong>
          <span>{activeBar.label} · {activeBar.value}</span>
          {activeBar.learnerCount && <small>{activeBar.learnerCount} learners</small>}
        </div>
      )}
    </div>
  );
}
