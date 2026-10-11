import GroupedBarChart from '../charts/GroupedBarChart';
import { RISK_BANDS, learnerCountScale } from '../../utils/riskPresentation';

export default function GradeLevelBreakdownChart({ data = [], gradeLevels = [], loading }) {
  const grades = [...new Set([
    ...gradeLevels.filter(option => option.value !== 'all').map(option => Number(option.value)),
    ...data.map(row => Number(String(row.grade).match(/\d+/)?.[0])),
  ])].filter(Number.isFinite).sort((a, b) => a - b);
  const displayGrades = grades.length ? grades : [7, 8, 9, 10];
  const groups = displayGrades.map(grade => {
    const row = data.find(item => Number(String(item.grade).match(/\d+/)?.[0]) === grade);
    return {
      id: String(grade), label: `Grade ${grade}`, shortLabel: `G${grade}`,
      values: RISK_BANDS.map(band => ({
        id: `${grade}-${band.level}`, label: band.label, color: band.color, value: row?.[band.level] ?? 0,
      })),
    };
  });
  const highestCount = Math.max(0, ...groups.flatMap(group => group.values.map(bar => bar.value)));
  const { maximum, ticks } = learnerCountScale(highestCount);
  return <div className="ar-chart-card ar-grade-chart">
    <div className="ar-chart-header-vertical">
      <h2 className="ar-chart-title">Breakdown by Grade Level</h2>
      <p className="ar-chart-subtitle">English learners with predictions · Learners awaiting records excluded</p>
    </div>
    {loading ? <div className="ar-skeleton-bars" /> : <>
      <div className="ar-grade-chart-legend">{RISK_BANDS.map(band => <span key={band.level}>
        <i style={{ backgroundColor: band.color }} aria-hidden="true" />{band.label}
      </span>)}</div>
      <p className="ar-chart-subtitle">Number of learners</p>
      <GroupedBarChart groups={groups} ariaLabel="English learner risk counts by grade level"
        minimum={0} maximum={maximum} ticks={ticks} benchmark={null} showZeroValues={false} />
    </>}
  </div>;
}
