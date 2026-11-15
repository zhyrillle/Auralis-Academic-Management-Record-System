import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export default function DepartmentRiskSummary({ query, analysisUrl }) {
  const summary = query.data?.summary;
  const high = summary?.total ? Math.round(summary.high / summary.total * 100) : 0;
  const moderate = summary?.total ? Math.round(summary.moderate / summary.total * 100) : 0;
  const percentages = { high, moderate, low: summary?.total ? Math.max(0, 100 - high - moderate) : 0 };
  const bands = [{ key: 'low', label: 'Low risk' }, { key: 'moderate', label: 'Moderate risk' }, { key: 'high', label: 'High risk' }];
  return <section className="dept-risk-summary" aria-label="Academic risk summary">
    <header className="dept-overview-section__header"><div className="dept-overview-section__title"><AlertTriangle size={21} aria-hidden="true" />
      <div><h2>Academic risk</h2><p>{query.term === 'ALL' ? 'Learner-term entries' : 'Learners'} grouped by risk level{summary ? ` · ${summary.total} ${query.term === 'ALL' ? 'entries' : 'learners'}` : ''}</p></div></div>
      <Link className="dept-risk-summary__link" to={analysisUrl}>View risk analysis <span aria-hidden="true">→</span></Link></header>
    {query.error && <div className="dept-error-banner" role="alert">{String(query.error)} <button type="button" onClick={query.refresh}>Retry risk counts</button></div>}
    <div className="dept-risk-summary__bands">{bands.map(band => <article key={band.key} className={`dept-risk-band dept-risk-band--${band.key}`}>
      <div><span><i aria-hidden="true" />{band.label}</span><small>{summary ? `${percentages[band.key]}%` : '—'}</small></div>
      <strong>{summary ? summary[band.key] : '—'}</strong></article>)}</div>
  </section>;
}
