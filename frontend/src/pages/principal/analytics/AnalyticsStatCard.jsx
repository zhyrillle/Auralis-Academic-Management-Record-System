import { SkeletonCards, SkeletonRegion } from '../../../components/common/PageSkeleton';

export default function AnalyticsStatCard({ label, value, description, icon: Icon, tone = "navy", loading = false }) {
  const isTextValue = typeof value === "string" && /\p{L}/u.test(value);
  if (loading) return <SkeletonRegion label={`Loading ${label}`}><SkeletonCards count={1} /></SkeletonRegion>;
  return (
    <article className={`pa-stat-card pa-stat-card--${tone}`} aria-busy={loading}>
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
