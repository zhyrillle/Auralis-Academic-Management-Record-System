/**
 * @typedef {Object} OverallDistributionProps
 * @property {{ high: {count: number, percent: number}, medium: {count: number, percent: number}, low: {count: number, percent: number}, totalFlagged: number }} data
 * @property {boolean} [loading]
 */

const SEGMENT_COLORS = {
  high: "#EF4444",
  medium: "#F4B400",
  low: "#16A34A",
};

export default function OverallDistributionChart({ data, loading }) {
  if (loading) {
    return (
      <div className="ar-card">
        <h2 className="ar-card-title">OVERALL DISTRIBUTION</h2>
        <div className="ar-skeleton-ring" />
      </div>
    );
  }

  const total = data.totalFlagged || 0;
  const segments = [
    { key: "high", label: "High", ...data.high },
    { key: "medium", label: "Medium", ...data.medium },
    { key: "low", label: "Low", ...data.low },
  ];

  let cumulative = 0;
  const paths = segments.map((seg) => {
    const pct = total > 0 ? (seg.count / total) * 100 : 0;
    const offset = cumulative;
    cumulative += pct;
    return { ...seg, pct, offset };
  });

  return (
    <div className="ar-card">
      <div className="ar-legend-row">
        {segments.map((seg) => (
          <span key={seg.key} className="ar-legend-item">
            <span className="ar-legend-dot" style={{ background: SEGMENT_COLORS[seg.key] }} />
            {seg.label}
          </span>
        ))}
      </div>
      <div className="ar-donut-wrap">
        <div className="ar-donut" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="ar-donut-svg">
            {paths.map((seg, idx) => (
              <path
                key={idx}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={SEGMENT_COLORS[seg.key]}
                strokeWidth="3.8"
                strokeDasharray={`${seg.pct}, 100`}
                strokeDashoffset={`${-seg.offset}`}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="ar-donut-center">
            <span className="ar-donut-count">{total}</span>
            <span className="ar-donut-label">flagged</span>
          </div>
        </div>
      </div>
      <div className="ar-donut-legend">
        {paths.map((seg) => (
          <div key={seg.key} className="ar-donut-legend-item">
            <span className="ar-donut-legend-dot" style={{ background: SEGMENT_COLORS[seg.key] }} />
            <span className="ar-donut-legend-pct">{seg.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
