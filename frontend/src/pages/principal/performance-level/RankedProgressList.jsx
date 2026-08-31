import ProgressBar from "../../../components/charts/ProgressBar";

export default function RankedProgressList({
  title,
  items,
  valueLabel = "Average Grade",
  subtitle = "Ranked from the area requiring the closest review.",
  suffix = "",
  headerAction = null,
  maxItems,
  viewportItems,
  emptyMessage = "No matching results.",
  className = "",
}) {
  const visibleItems = Number.isInteger(maxItems)
    ? items.slice(0, maxItems)
    : items;
  const values = visibleItems.map((item) => item.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 100;
  const spread = Math.max(maximum - minimum, 1);
  const hasPreservedViewport = Number.isInteger(viewportItems);
  const preservedItems = hasPreservedViewport
    ? Math.min(Math.max(viewportItems, 1), maxItems ?? viewportItems)
    : 0;

  const content = visibleItems.length ? (
    <ol className="pp-ranked-list">
      {visibleItems.map((item, index) => {
        const width = 28 + ((item.value - minimum) / spread) * 72;
        return (
          <li key={item.id}>
            <span className="pp-ranked-list__rank">{index + 1}</span>
            <strong>{item.label}</strong>
            <ProgressBar
              value={width}
              tone={item.tone || "neutral"}
              animationDelay={index * 55}
              animationDuration={700}
              ariaHidden
            />
            <span className="pp-ranked-list__value">
              <span className="pa-sr-only">{valueLabel}: </span>
              {item.value}
              {suffix}
            </span>
          </li>
        );
      })}
    </ol>
  ) : (
    <p className="pp-panel-empty" role="status">
      {emptyMessage}
    </p>
  );

  return (
    <section
      className={`pa-panel pp-ranked-panel${className ? ` ${className}` : ""}`}
    >
      <div className="pa-panel__header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {headerAction && (
          <div className="pp-ranked-panel__filter">{headerAction}</div>
        )}
      </div>
      {hasPreservedViewport ? (
        <div
          className="pp-ranked-viewport pp-ranked-viewport--preserved"
          style={{
            "--pp-ranked-visible-items": preservedItems,
            "--pp-ranked-fallback-height": `${20 + preservedItems * 49}px`,
          }}
        >
          {content}
        </div>
      ) : (
        content
      )}
    </section>
  );
}
