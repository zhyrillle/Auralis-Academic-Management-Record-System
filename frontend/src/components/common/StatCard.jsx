export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  className = "",
  variant = "primary",
}) {
  const classes = [
    "summary-stat-card",
    `summary-stat-card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      <div className="summary-stat-card__content">
        <p className="summary-stat-card__title">{title}</p>
        <strong className="summary-stat-card__value">{value}</strong>
        <p className="summary-stat-card__description">{description}</p>
      </div>

      {Icon && (
        <div className="summary-stat-card__icon" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </div>
      )}
    </article>
  );
}
