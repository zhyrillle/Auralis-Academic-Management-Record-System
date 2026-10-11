import { useState } from 'react';
import { SearchX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import AnalyticsTermTabs from '../../pages/principal/analytics/AnalyticsTermTabs';
import SearchBar from '../common/SearchBar';
import EmptyState from '../common/EmptyState';
import StudentRiskCard from './StudentRiskCard';
import LearnerPredictionDialog from './LearnerPredictionDialog';
import { RISK_FILTERS, sortByRisk, filterLearners, learnerListPath } from '../../utils/riskPresentation';

export default function PredictionLearnerList({ data, loading, filterQuery }) {
  const [params, setParams] = useSearchParams();
  const level = RISK_FILTERS.some(option => option.id === params.get('risk')) ? params.get('risk') : 'all';
  const search = params.get('search') || '';
  const [selectedStudent, setSelectedStudent] = useState(null);
  const matching = filterLearners(sortByRisk((data?.students || []).filter(student => level === 'all' || student.riskLevel === level)), { search });
  const update = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }); };
  const listQuery = new URLSearchParams(filterQuery);
  if (search) listQuery.set('search', search);
  return <section className="ar-prediction-list-panel" aria-label="Learner predictions" aria-busy={loading}>
    <div className="ar-prediction-list-heading"><div><h2>Learner predictions</h2><p>Review records before acting on a risk label.</p></div>
      {!loading && matching.length > 0 && <Link className="ar-list-see-all" to={learnerListPath('prediction', level, listQuery.toString())}>See all</Link>}
    </div>
    <div className="ar-prediction-list-tools">
      <AnalyticsTermTabs options={RISK_FILTERS} value={level} onChange={value => update('risk', value)} disabled={loading} ariaLabel="Filter by risk level" />
      <SearchBar query={search} setQuery={value => update('search', value)} placeholder="Search name, section or adviser…" />
    </div>
    <p className="ar-list-result-count" aria-live="polite">{loading ? 'Loading learner predictions…' : `Showing ${Math.min(matching.length, 3)} of ${matching.length} learners`}</p>
    <div className="ar-full-learner-list">
      {loading ? [1, 2, 3].map(index => <StudentRiskCard key={index} loading />)
        : !matching.length ? <EmptyState className="ar-preview-empty pa-empty-state" icon={SearchX}
          title="No learners found"
          description="Try a different risk level or search. Learners awaiting records are listed separately." />
          : matching.slice(0, 3).map(student => <StudentRiskCard key={student.id} {...student} onView={() => setSelectedStudent(student)} />)}
    </div>
    <LearnerPredictionDialog student={selectedStudent} onClose={() => setSelectedStudent(null)} />
  </section>;
}
