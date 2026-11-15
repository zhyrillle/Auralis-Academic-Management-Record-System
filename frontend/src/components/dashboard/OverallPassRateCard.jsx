import { SkeletonBlock, SkeletonRegion } from '../common/PageSkeleton.jsx';
import DonutChart from '../charts/DonutChart';

export default function OverallPassRateCard({ data, loading }) {
  return <section className="dept-card dept-card-narrow dept-pass-chart">
    <h2 className="dept-card-title">{loading ? <SkeletonBlock width="45%" height={18} /> : <>Overall pass rate</>}</h2>
    <p className="dept-chart-context">Based on {data.total} saved grade results</p>
    {loading ? <SkeletonRegion label="Loading pass rate"><SkeletonBlock className="dept-skeleton-ring" /></SkeletonRegion> : <>
      <DonutChart data={[{ id: 'passed', label: 'Passed', value: Number(data.passed), color: '#168449' },
        { id: 'failed', label: 'Failed', value: Number(data.failed), color: '#C62828' }]}
        ariaLabel="Passed and failed learner counts" suffix="" centerValue={data.total ? data.passRatePercentage + '%' : '—'} centerLabel="Pass rate" />
      {!data.total && <p className="dept-pass-chart-caption">No grade results available for this selection.</p>}
      <p className="dept-pass-chart-caption">Passed {data.passed} / {data.total} grade results</p>
    </>}
  </section>;
}
