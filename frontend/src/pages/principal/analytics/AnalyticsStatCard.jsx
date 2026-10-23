export default function AnalyticsStatCard({ label, value, description, icon: Icon, tone = "navy" }) {
  const isTextValue = typeof value === "string" && /\p{L}/u.test(value);
  return (
    <article className={`pa-stat-card pa-stat-card--${tone}`}>
      <div>
        <span className="pa-stat-card__label">{label}</span>
        <strong className={`pa-stat-card__value${isTextValue ? " pa-stat-card__value--text" : ""}`}>{value}</strong>
        <span className="pa-stat-card__description">{description}</span>
      </div>
      <span className="pa-stat-card__icon" aria-hidden="true">
        <Icon size={21} />
      </span>
    </article>
  );
}
