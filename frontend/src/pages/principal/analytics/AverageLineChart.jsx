import { useId, useState } from "react";

const WIDTH = 960;
const HEIGHT = 300;
const PADDING = { top: 24, right: 28, bottom: 42, left: 48 };
const Y_MIN = 65;
const Y_MAX = 100;
const TERMS = ["Term 1", "Term 2", "Term 3"];

const xFor = (index) =>
  PADDING.left + index * ((WIDTH - PADDING.left - PADDING.right) / 2);
const yFor = (value) =>
  PADDING.top +
  ((Y_MAX - value) / (Y_MAX - Y_MIN)) *
    (HEIGHT - PADDING.top - PADDING.bottom);

export default function AverageLineChart({ series, showArea = false, ariaLabel }) {
  const gradientId = useId().replaceAll(":", "");
  const [activePoint, setActivePoint] = useState(null);
  const gridValues = [70, 75, 80, 85, 90, 95, 100];

  return (
    <div className="pa-chart__viewport">
      <svg
        className="pa-chart__svg"
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

        {gridValues.map((value) => (
          <g key={value} className={value === 75 ? "pa-chart__benchmark" : ""}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={yFor(value)} y2={yFor(value)} />
            <text x={PADDING.left - 11} y={yFor(value) + 4} textAnchor="end">{value}</text>
          </g>
        ))}

        {TERMS.map((term, index) => (
          <text key={term} className="pa-chart__axis-label" x={xFor(index)} y={HEIGHT - 12} textAnchor="middle">
            {term}
          </text>
        ))}

        {series.map((item, seriesIndex) => {
          const points = item.values.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(" ");
          const areaPoints = `${xFor(0)},${yFor(Y_MIN)} ${points} ${xFor(2)},${yFor(Y_MIN)}`;
          const seriesKey = `${item.id}-${item.values.map((point) => point.value).join("-")}`;

          return (
            <g key={seriesKey} className="pa-chart__series">
              {showArea && seriesIndex === 0 && (
                <polygon points={areaPoints} fill={`url(#${gradientId})`} />
              )}
              <polyline
                className="pa-chart__line"
                points={points}
                fill="none"
                stroke={item.color}
                strokeWidth={series.length > 4 ? 1.05 : 1.4}
              />
              {item.values.map((point, index) => {
                const detail = {
                  id: `${item.id}-${index}`,
                  label: item.label,
                  term: TERMS[index],
                  value: point.value,
                  learnerCount: point.learnerCount,
                  x: xFor(index),
                  y: yFor(point.value),
                  color: item.color,
                };
                return (
                  <circle
                    key={detail.id}
                    className="pa-chart__point"
                    cx={detail.x}
                    cy={detail.y}
                    r="5"
                    fill={item.color}
                    tabIndex="0"
                    role="button"
                    aria-label={`${detail.label}, ${detail.term}: ${detail.value} average grade, ${detail.learnerCount} learners`}
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
          className="pa-chart-tooltip"
          style={{ left: `${(activePoint.x / WIDTH) * 100}%`, top: `${(activePoint.y / HEIGHT) * 100}%` }}
          role="status"
        >
          <strong>{activePoint.label}</strong>
          <span>{activePoint.term} · {activePoint.value}</span>
          <small>{activePoint.learnerCount} learners</small>
        </div>
      )}
    </div>
  );
}
