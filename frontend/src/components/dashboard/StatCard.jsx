/**
 * @typedef {Object} StatCardProps
 * @property {string} title
 * @property {number|string} value
 * @property {string|React.ReactNode} caption
 * @property {string} accentColor
 */

export default function StatCard({ title, value, caption, accentColor }) {
  return (
    <div className="dept-stat-card">
      <div className="dept-stat-header">
        <span className="dept-stat-title">{title}</span>
      </div>
      <div className="dept-stat-body">
        <span className="dept-stat-value" style={{ color: accentColor }}>{value}</span>
        <span className="dept-stat-caption">{caption}</span>
      </div>
    </div>
  );
}
