export default function AnalyticsStatCard({ label, value, description, icon: Icon, tone = "navy" }) {
  return (
    <article className={`pa-stat-card pa-stat-card--${tone}`}>
      <div>
        <span className="pa-stat-card__label">{label}</span>
        <strong className="pa-stat-card__value">{value}</strong>
        <span className="pa-stat-card__description">{description}</span>
      </div>
      <span className="pa-stat-card__icon" aria-hidden="true">
        <Icon size={21} />
      </span>
    </article>
  );
}
