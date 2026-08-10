/**
 * @typedef {Object} RiskLevelCardProps
 * @property {string} riskLevel - "low" | "medium" | "high"
 * @property {string} label
 * @property {number} count
 * @property {string[]} notes
 * @property {boolean} [loading]
 */

const RISK_CONFIG = {
  low: {
    pillClass: "ar-pill-green",
    accent: "#16A34A",
  },
  medium: {
    pillClass: "ar-pill-amber",
    accent: "#F4B400",
  },
  high: {
    pillClass: "ar-pill-red",
    accent: "#EF4444",
  },
};

export default function RiskLevelCard({ riskLevel, label, count, notes, loading }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.low;

  return (
    <div className="ar-card">
      <div className="ar-risk-header">
        <span className={`ar-risk-pill ${config.pillClass}`}>{label}</span>
        <span className="ar-risk-count" style={{ color: config.accent }}>
          {loading ? "—" : `${count} learners`}
        </span>
      </div>
      <div className="ar-risk-body">
        {loading ? (
          <div className="ar-skeleton-lines">
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
            <div className="ar-skeleton-line" />
          </div>
        ) : (
          <ul className="ar-risk-list">
            {notes.map((note, idx) => (
              <li key={idx} className="ar-risk-list-item">{note}</li>
            ))}
            {notes.length === 0 && (
              <li className="ar-risk-list-item ar-risk-empty">No flagged reasons yet</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
