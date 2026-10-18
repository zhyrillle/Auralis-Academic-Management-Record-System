import { useId, useRef, useState } from "react";
import "../../styles/charts.css";

export default function StackedBarChart({
  groups,
  ariaLabel,
  legendItems: suppliedLegendItems,
  maxVisibleGroups,
  showTooltips = false,
  emptyMessage = "No chart data available.",
}) {
  const chartRef = useRef(null);
  const tooltipId = useId();
  const [activeSegment, setActiveSegment] = useState(null);
  const activeGroup = groups.find(group => group.id === activeSegment?.groupId);
  const activeData = activeGroup?.segments.find(segment => segment.id === activeSegment?.segmentId);
  const legendItems = suppliedLegendItems || groups[0]?.segments || [];
  const hasLimitedViewport = Number.isInteger(maxVisibleGroups);
  const isScrollable = hasLimitedViewport && groups.length > maxVisibleGroups;
  // Render rows whenever groups exist; zero-valued segments simply draw empty tracks.
  const hasData = groups.length > 0;

  const showSegmentTooltip = (element, group, segment) => {
    if (!showTooltips) return;
    const chartBounds = chartRef.current.getBoundingClientRect();
    const segmentBounds = element.getBoundingClientRect();
    setActiveSegment({
      groupId: group.id,
      segmentId: segment.id,
      x: segmentBounds.left + segmentBounds.width / 2 - chartBounds.left,
      y: segmentBounds.top - chartBounds.top,
    });
  };

  return (
    <div className="stacked-bar-chart" role="group" aria-label={ariaLabel} ref={chartRef}
      onScrollCapture={() => setActiveSegment(null)}
      onKeyDown={event => { if (event.key === 'Escape') setActiveSegment(null); }}>
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
        {hasData ? (
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
                    title={showTooltips ? undefined : `${segment.label}: ${segment.valueLabel ?? `${segment.value}%`}`}
                    tabIndex="0"
                    role="img"
                    aria-label={`${group.label}, ${segment.label}: ${segment.valueLabel ?? `${segment.value}%`}`}
                    aria-describedby={showTooltips && activeData && activeSegment.groupId === group.id && activeSegment.segmentId === segment.id ? tooltipId : undefined}
                    onMouseEnter={event => showSegmentTooltip(event.currentTarget, group, segment)}
                    onMouseLeave={() => setActiveSegment(null)}
                    onFocus={event => showSegmentTooltip(event.currentTarget, group, segment)}
                    onBlur={() => setActiveSegment(null)}
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
      {showTooltips && activeData && (
        <div className="chart-tooltip chart-tooltip--compact stacked-bar-chart__tooltip"
          id={tooltipId} role="tooltip"
          style={{ left: `clamp(74px, ${activeSegment.x}px, calc(100% - 74px))`, top: activeSegment.y }}>
          <strong>{activeGroup.label}</strong>
          <span>{activeData.label}</span>
          <small>{activeData.valueLabel ?? `${activeData.value}%`}</small>
        </div>
      )}
    </div>
  );
}
