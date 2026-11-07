import { SkeletonCards, SkeletonRegion } from './PageSkeleton';

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  className = "",
  variant = "primary",
  loading = false,
}) {
  const classes = [
    "summary-stat-card",
    `summary-stat-card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (loading) return <SkeletonRegion label={`Loading ${title}`} className={className}><SkeletonCards count={1} /></SkeletonRegion>;

  return (
    <article className={classes} aria-busy={loading}>
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
