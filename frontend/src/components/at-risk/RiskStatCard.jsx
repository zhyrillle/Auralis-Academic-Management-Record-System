/**
 * @typedef {Object} RiskStatCardProps
 * @property {string} title
 * @property {number} value
 * @property {string} caption
 * @property {string} accentColor
 * @property {string} icon
 * @property {boolean} [loading]
 */

export default function RiskStatCard({ title, value, caption, accentColor, icon, loading }) {
  return (
    <div className="ar-stat-card">
      <div className="ar-stat-header">
        <span className="ar-stat-title">{title}</span>
        <span className="ar-stat-icon" style={{ background: `${accentColor}14`, color: accentColor }}>
          {icon}
        </span>
      </div>
      <div className="ar-stat-body">
        <span className="ar-stat-value" style={{ color: accentColor }}>
          {loading ? "—" : value}
        </span>
        <span className="ar-stat-caption">{caption}</span>
      </div>
    </div>
  );
}
