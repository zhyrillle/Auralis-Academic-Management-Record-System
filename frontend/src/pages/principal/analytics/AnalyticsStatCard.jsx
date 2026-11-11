import { SkeletonCards, SkeletonRegion } from '../../../components/common/PageSkeleton';
import { Link } from 'react-router-dom';

export default function AnalyticsStatCard({ label, value, description, icon: Icon, tone = "navy", loading = false, onClick, to, ariaLabel }) {
  const isTextValue = typeof value === "string" && /\p{L}/u.test(value);
  if (loading) return <SkeletonRegion label={`Loading ${label}`}><SkeletonCards count={1} /></SkeletonRegion>;
  const Container = to ? Link : onClick ? 'button' : 'article';
  return (
    <Container className={`pa-stat-card pa-stat-card--${tone}${to || onClick ? ' pa-stat-card--shortcut' : ''}`} aria-busy={loading}
      {...(to ? { to } : onClick ? { type: 'button', onClick } : {})}
      aria-label={ariaLabel}>
      <div>
        <span className="pa-stat-card__label">{label}</span>
        <strong className={`pa-stat-card__value${isTextValue ? " pa-stat-card__value--text" : ""}`}>{value}</strong>
        <span className="pa-stat-card__description">{description}</span>
      </div>
      <span className="pa-stat-card__icon" aria-hidden="true">
        <Icon size={21} />
      </span>
    </Container>
  );
}
