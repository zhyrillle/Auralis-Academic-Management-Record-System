import { useEffect, useRef, useState } from 'react';
import { SkeletonBlock } from '../common/PageSkeleton';
import '../../styles/riskCarouselCard.css';

const bands = [
  { key: 'high', label: 'High-Risk Students', note: 'Requires intervention' },
  { key: 'medium', label: 'Medium-Risk Students', note: 'Monitor closely' },
  { key: 'low', label: 'Low-Risk Students', note: 'On track' },
];

export default function RiskCarouselCard({ high, medium, low, loading = false, error, onRetry, onSelect }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [announcement, setAnnouncement] = useState('');
  const card = useRef(null);
  const counts = { high, medium, low };
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const row = card.current?.closest('.adviser-dashboard__stat-row') || card.current;
    const enter = () => setPaused(true), leave = () => setPaused(false);
    row?.addEventListener('mouseenter', enter);
    row?.addEventListener('mouseleave', leave);
    return () => { row?.removeEventListener('mouseenter', enter); row?.removeEventListener('mouseleave', leave); };
  }, []);
  useEffect(() => {
    if (loading || error || paused || reduced) return;
    const timer = setInterval(() => setActive(value => (value + 1) % bands.length), 3500);
    return () => clearInterval(timer);
  }, [loading, error, paused, reduced]);
  const choose = index => {
    setActive(index);
    setAnnouncement(`${bands[index].label}: ${counts[bands[index].key] ?? 'Unavailable'}. ${bands[index].note}.`);
  };
  return <div ref={card} className="adviser-dashboard__stat-card risk-carousel" aria-busy={loading}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget) && !card.current?.closest('.adviser-dashboard__stat-row')?.matches(':hover')) setPaused(false); }}>
    <div className="risk-carousel__viewport" aria-live="off">
      {loading ? <div className="risk-carousel__loading" role="status" aria-label="Loading risk levels">
        <SkeletonBlock width="75%" /><SkeletonBlock width="30%" height={26} /><SkeletonBlock width="60%" />
      </div> : error ? <div className="risk-carousel__error" role="alert">
        <span>Risk counts unavailable</span>
        <button type="button" onClick={onRetry}>Retry</button>
      </div> : <div className="risk-carousel__slides" style={{ transform: `translateY(-${active * 96}px)` }}>
        {bands.map((item, index) => <div key={item.key} className={`risk-carousel__slide risk-carousel__slide--${item.key}`} aria-hidden={index !== active}>
          <button type="button" className="risk-carousel__open" tabIndex={index === active ? 0 : -1}
            onClick={() => onSelect?.(item.key)} disabled={!onSelect}
            aria-label={`View ${item.label.toLowerCase()}: ${counts[item.key] ?? 'unavailable'}`}>
            <span className="risk-carousel__label"><span className="risk-carousel__dot" />{item.label}</span>
            <span className="risk-carousel__value">{counts[item.key] ?? '—'}</span>
            <span className="risk-carousel__note">{item.note}</span>
          </button>
        </div>)}
      </div>}
    </div>
    <div className="risk-carousel__selectors" aria-label="Risk level">
      {bands.map((item, index) => <button key={item.key} type="button"
        className={`risk-carousel__selector risk-carousel__slide--${item.key}`} disabled={loading || Boolean(error)}
        aria-label={`Show ${item.key}-risk students`} aria-pressed={active === index} onClick={() => choose(index)}>
        <span className="risk-carousel__dot" />
      </button>)}
    </div>
    <span className="risk-carousel__announcement" role="status" aria-live="polite">{announcement}</span>
  </div>;
}
