import { useSearchParams, useNavigate } from 'react-router-dom';
import BackButton from '../../components/common/BackButton';
import { useDepartmentContext } from '../../services/deptHeadMonitoringApi';
import useDepartmentAcademicRisk from '../../services/useDepartmentAcademicRisk';
import DepartmentRiskOverview from '../../components/dashboard/DepartmentRiskOverview';
import FilterBar from '../../components/dashboard/FilterBar';
import StatCard from '../../components/common/StatCard';
import '../../styles/departmentHeadDashboard.css';
import '../../styles/departmentMonitoring.css';

export default function DepartmentRiskAnalysis() {
  const context = useDepartmentContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const defaultYear = (context.data?.schoolYears.find(year => year.isCurrent) || context.data?.schoolYears[0])?.label || '';
  const filters = { schoolYear: params.get('schoolYear') || defaultYear, gradeLevel: params.get('gradeLevel') || '', quarter: params.get('quarter') || '' };
  const query = useDepartmentAcademicRisk(filters);
  const summary = query.data?.summary;
  const busy = query.loading || query.isPreviousData;
  const update = (key, value) => setParams({ ...filters, [key]: value });
  const back = new URLSearchParams(filters);
  const subject = context.data?.subject?.name || context.data?.department?.name || 'Department';
  return <div className="dept-dashboard-page dept-monitor-page dept-risk-analysis">
    <header className="dept-dashboard-header dept-risk-analysis__header"><BackButton label="Back to department overview" onClick={() => navigate(`/department-head/dashboard?${back}`)} /><div><h1 className="dept-dashboard-title">{subject} risk analysis</h1><p className="dept-dashboard-subtitle">Rule-based academic monitoring for the assigned subject.</p></div></header>
    <FilterBar filters={filters} onChange={update} schoolYears={context.data?.schoolYears} disabled={context.loading} />
    {context.error && <div className="dept-error-banner" role="alert">{String(context.error)}</div>}
    <section className="dept-stats-row" aria-label="Academic risk totals">
      {[{ key: 'low', label: 'Low Risk', description: 'Preview grade 80 or above', variant: 'success' },
        { key: 'moderate', label: 'Moderate Risk', description: 'Preview grade 75 to below 80', variant: 'warning' },
        { key: 'high', label: 'High Risk', description: 'Preview grade below 75', variant: 'danger' },
        { key: 'total', label: query.term === 'ALL' ? 'Total Learner-Term Entries' : 'Total Learners', description: 'With a valid grade preview', variant: 'info' }]
        .map(card => <StatCard key={card.key} className={`dept-analysis-stat--${card.key}`} title={card.label} description={card.description} variant={card.variant} loading={busy} value={summary ? summary[card.key] : '—'} />)}
    </section>
    <DepartmentRiskOverview query={{ ...query, loading: busy }} />
    {summary?.total === 0 && <p className="dept-risk-analysis__note">No academic risk results are available for this selection.</p>}
  </div>;
}
