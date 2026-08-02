export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  className = "",
  variant = "primary",
}) {
  const classes = ["stat-card", `stat-card--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      <div className="stat-card__content">
        <p className="stat-card__title">{title}</p>
        <strong className="stat-card__value">{value}</strong>
        <p className="stat-card__description">{description}</p>
      </div>

      {Icon && (
        <div className="stat-card__icon" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </div>
      )}
    </article>
  );
}
