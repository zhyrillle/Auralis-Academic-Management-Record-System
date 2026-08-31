import "../../styles/charts.css";

export default function StackedBarChart({
  groups,
  ariaLabel,
  legendItems: suppliedLegendItems,
  maxVisibleGroups,
  emptyMessage = "No chart data available.",
}) {
  const legendItems = suppliedLegendItems || groups[0]?.segments || [];
  const hasLimitedViewport = Number.isInteger(maxVisibleGroups);
  const isScrollable = hasLimitedViewport && groups.length > maxVisibleGroups;

  return (
    <div className="stacked-bar-chart" role="group" aria-label={ariaLabel}>
      <div className="stacked-bar-chart__legend" aria-label="Chart legend">
        {legendItems.map((segment) => (
          <span key={segment.id}>
            <i style={{ "--chart-series-color": segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>
      <div
        className={`stacked-bar-chart__groups${
          hasLimitedViewport ? " stacked-bar-chart__groups--limited" : ""
        }`}
        style={
          hasLimitedViewport
            ? {
                "--stacked-visible-groups": maxVisibleGroups,
                "--stacked-fallback-height": `${maxVisibleGroups * 48}px`,
              }
            : undefined
        }
        tabIndex={isScrollable ? 0 : undefined}
        aria-label={isScrollable ? `Scrollable ${ariaLabel}` : undefined}
      >
        {groups.length ? (
          groups.map((group, groupIndex) => (
            <div className="stacked-bar-chart__group" key={group.id}>
              <strong>{group.label}</strong>
              <div
                className="stacked-bar-chart__bar"
                aria-label={`${group.label} distribution`}
              >
                {group.segments.map((segment, segmentIndex) => (
                  <span
                    key={segment.id}
                    style={{
                      width: `${segment.value}%`,
                      backgroundColor: segment.color,
                      animationDelay: `${groupIndex * 55 + segmentIndex * 35}ms`,
                    }}
                    title={`${segment.label}: ${segment.value}%`}
                    tabIndex="0"
                    role="img"
                    aria-label={`${group.label}, ${segment.label}: ${segment.value}%`}
                  />
                ))}
              </div>
              <span>{group.displayValue}</span>
            </div>
          ))
        ) : (
          <p className="stacked-bar-chart__empty" role="status">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
