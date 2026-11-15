import { SkeletonBlock, SkeletonRegion } from '../common/PageSkeleton.jsx';
import StackedBarChart from '../charts/StackedBarChart';

const gradeNumber = value => Number(String(value || '').match(/(?:10|[7-9])/)?.[0]);

export default function ComparativeAnalysisCard({ data, loading, error, departmentName, onRetry }) {
  const byGrade = new Map(data.map(row => [gradeNumber(row.gradeLevel), row]));
  const groups = [7, 8, 9, 10].map(grade => {
    const row = byGrade.get(grade);
    const total = (Number(row?.passed) || 0) + (Number(row?.fail) || 0);
    return { id: 'G' + grade, label: 'G' + grade,
      displayValue: row ? row.passingRate + '% pass' : 'No records',
      segments: [
        { id: 'passed', label: 'Passed', color: '#168449', value: total ? (Number(row?.passed) || 0) / total * 100 : 0, valueLabel: `${row?.passedLearners || 0} learners${row?.passedLearners !== row?.passed && row ? `\n${row.passed} saved grades` : ''}` },
        { id: 'fail', label: 'Failed', color: '#C62828', value: total ? (Number(row?.fail) || 0) / total * 100 : 0, valueLabel: `${row?.failedLearners || 0} learners${row?.failedLearners !== row?.fail && row ? `\n${row.fail} saved grades` : ''}` },
      ] };
  });
  return <section className="dept-card dept-card-wide dept-comparison-chart">
    <h2 className="dept-card-title">{loading ? <SkeletonBlock width="45%" height={18} /> : <>Grade comparison{departmentName ? ' · ' + departmentName : ''}</>}</h2>
    <p className="dept-chart-context">Share of saved grade results passed and failed</p>
    {loading ? <SkeletonRegion label="Loading grade comparison"><SkeletonBlock className="dept-skeleton-table" /></SkeletonRegion> : error ? <div className="dept-error-banner" role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Retry grade comparison</button>}</div>
      : <StackedBarChart groups={groups} ariaLabel="Grade comparison for Grades 7 to 10" showTooltips />}
  </section>;
}


