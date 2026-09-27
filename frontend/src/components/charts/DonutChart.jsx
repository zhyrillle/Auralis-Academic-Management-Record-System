import { useState } from "react";
import "../../styles/charts.css";

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 72;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DonutChart({
  data,
  ariaLabel,
  suffix = "%",
  centerLabel = "Total",
  centerValue,
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const activeItem = activeIndex === null ? null : data[activeIndex];

  return (
    <div className="donut-chart">
      <div className="donut-chart__visual">
        <svg
          className="donut-chart__svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            className="donut-chart__track"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
          />
          {data.map((item, index) => {
            const preceding = data
              .slice(0, index)
              .reduce((sum, entry) => sum + entry.value, 0);
            const proportion = total ? item.value / total : 0;
            const dash = Math.max(CIRCUMFERENCE * proportion - 5, 0);
            const offset = -(CIRCUMFERENCE * (preceding / Math.max(total, 1)));
            return (
              <circle
                key={item.id}
                className={`donut-chart__segment${activeIndex === index ? " is-active" : activeIndex !== null ? " is-muted" : ""}`}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke={item.color}
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={offset}
                tabIndex="0"
                role="button"
                aria-label={`${item.label}: ${item.value}${suffix}`}
                style={{ animationDelay: `${index * 100}ms` }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
            );
          })}
        </svg>
        <div className="donut-chart__center" aria-hidden="true">
          <strong>
            {activeItem
              ? `${activeItem.value}${suffix}`
              : `${centerValue ?? total}${suffix}`}
          </strong>
          <span>{activeItem?.label || centerLabel}</span>
        </div>
      </div>
      <div className="donut-chart__legend" aria-label="Distribution legend">
        {data.map((item) => (
          <span key={item.id}>
            <i style={{ "--chart-series-color": item.color }} />
            <b>{item.label}</b>
            <strong>
              {item.value}
              {suffix}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}
