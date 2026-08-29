export default function AnalyticsSkeleton({ table = false }) {
  return (
    <div className="pa-skeleton" aria-busy="true" aria-label="Loading performance analytics">
      <span className="pa-sr-only">Loading performance analytics.</span>
      <div className="pa-skeleton__heading" aria-hidden="true" />
      <div className="pa-skeleton__filters" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="pa-skeleton__cards" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => <span key={item} />)}
      </div>
      <div className="pa-skeleton__chart" aria-hidden="true">
        <span className="pa-skeleton__chart-title" />
        <span className="pa-skeleton__chart-body" />
      </div>
      <div className={`pa-skeleton__chart${table ? " pa-skeleton__chart--table" : ""}`} aria-hidden="true">
        <span className="pa-skeleton__chart-title" />
        <span className="pa-skeleton__chart-body" />
      </div>
    </div>
  );
}
