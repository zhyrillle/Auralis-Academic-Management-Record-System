import { useId, useState } from "react";
import "../../styles/charts.css";

const WIDTH = 960;
const HEIGHT = 300;
const PADDING = { top: 24, right: 28, bottom: 42, left: 48 };

export default function LineChart({
  series,
  showArea = false,
  ariaLabel,
  labels = [],
  minimum = 65,
  maximum = 100,
  ticks = [70, 75, 80, 85, 90, 95, 100],
  benchmark = 75,
  selectedIndex,
  suffix = "",
}) {
  const gradientId = useId().replaceAll(":", "");
  const [activePoint, setActivePoint] = useState(null);
  const categories = labels.length
    ? labels
    : (series[0]?.values || []).map(
        (point, index) => point.label || `Item ${index + 1}`,
      );
  const xFor = (index) =>
    PADDING.left +
    index *
      ((WIDTH - PADDING.left - PADDING.right) /
        Math.max(categories.length - 1, 1));
  const yFor = (value) =>
    PADDING.top +
    ((maximum - value) / Math.max(maximum - minimum, 1)) *
      (HEIGHT - PADDING.top - PADDING.bottom);

  return (
    <div className="chart-viewport chart-viewport--wide line-chart">
      <svg
        className="chart-svg chart-svg--wide"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#315da5" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#315da5" stopOpacity="0.03" />
          </linearGradient>
        </defs>

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

        {selectedIndex !== undefined && (
          <rect
            className="line-chart__selection"
            x={xFor(selectedIndex) - 54}
            y={PADDING.top}
            width="108"
            height={HEIGHT - PADDING.top - PADDING.bottom}
            rx="10"
            aria-hidden="true"
          />
        )}

        {categories.map((category, index) => (
          <text
            key={category}
            className={`chart-axis-label${selectedIndex === index ? " is-selected" : ""}`}
            x={xFor(index)}
            y={HEIGHT - 12}
            textAnchor="middle"
          >
            {category}
          </text>
        ))}

        {series.map((item, seriesIndex) => {
          const points = item.values
            .map((point, index) => `${xFor(index)},${yFor(point.value)}`)
            .join(" ");
          const areaPoints = `${xFor(0)},${yFor(minimum)} ${points} ${xFor(Math.max(item.values.length - 1, 0))},${yFor(minimum)}`;
          const seriesKey = `${item.id}-${item.values.map((point) => point.value).join("-")}`;

          return (
            <g key={seriesKey} className="line-chart__series">
              {showArea && seriesIndex === 0 && (
                <polygon points={areaPoints} fill={`url(#${gradientId})`} />
              )}
              <polyline
                className="line-chart__line"
                points={points}
                fill="none"
                stroke={item.color}
                strokeWidth={series.length > 4 ? 1.05 : 1.4}
              />
              {item.values.map((point, index) => {
                const detail = {
                  id: `${item.id}-${index}`,
                  label: item.label,
                  category: categories[index],
                  value: point.value,
                  detail: point.detail,
                  x: xFor(index),
                  y: yFor(point.value),
                  color: item.color,
                };
                return (
                  <circle
                    key={detail.id}
                    className={`line-chart__point${selectedIndex !== undefined && selectedIndex !== index ? " is-context" : ""}`}
                    cx={detail.x}
                    cy={detail.y}
                    r="5"
                    fill={item.color}
                    tabIndex="0"
                    role="button"
                    aria-label={`${detail.label}, ${detail.category}: ${detail.value}${suffix}${detail.detail ? `, ${detail.detail}` : ""}`}
                    onMouseEnter={() => setActivePoint(detail)}
                    onMouseLeave={() => setActivePoint(null)}
                    onFocus={() => setActivePoint(detail)}
                    onBlur={() => setActivePoint(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {activePoint && (
        <div
          className="chart-tooltip chart-tooltip--wide"
          style={{
            left: `clamp(76px, ${(activePoint.x / WIDTH) * 100}%, calc(100% - 76px))`,
            top: `clamp(56px, ${(activePoint.y / HEIGHT) * 100}%, calc(100% - 18px))`,
          }}
          role="status"
        >
          <strong>{activePoint.label}</strong>
          <span>
            {activePoint.category} · {activePoint.value}
            {suffix}
          </span>
          {activePoint.detail && <small>{activePoint.detail}</small>}
        </div>
      )}
    </div>
  );
}
