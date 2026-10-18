import StackedBarChart from '../charts/StackedBarChart';

const gradeNumber = value => Number(String(value || '').match(/(?:10|[7-9])/)?.[0]);

export default function ComparativeAnalysisCard({ data, loading, error, departmentName }) {
  const byGrade = new Map(data.map(row => [gradeNumber(row.gradeLevel), row]));
  const maximum = Math.max(1, ...data.map(row => Number(row.aboveAverage) + Number(row.fail)));
  const groups = [7, 8, 9, 10].map(grade => {
    const row = byGrade.get(grade);
    return { id: 'G' + grade, label: 'G' + grade,
      displayValue: row ? row.passingRate + '% pass' : 'No records',
      segments: [
        { id: 'above', label: 'Above average', color: '#16a34a', value: (Number(row?.aboveAverage) || 0) / maximum * 100, valueLabel: (Number(row?.aboveAverage) || 0) + ' learners' },
        { id: 'fail', label: 'Failing', color: '#ef5350', value: (Number(row?.fail) || 0) / maximum * 100, valueLabel: (Number(row?.fail) || 0) + ' learners' },
      ] };
  });
  return <section className="dept-card dept-card-wide dept-comparison-chart">
    <h2 className="dept-card-title">Grade comparison{departmentName ? ' · ' + departmentName : ''}</h2>
    {loading ? <div className="dept-skeleton-table" role="status" aria-label="Loading grade comparison" /> : error ? <p className="dept-error-text">{error}</p>
      : <StackedBarChart groups={groups} ariaLabel="Grade comparison for Grades 7 to 10" showTooltips />}
  </section>;
}


