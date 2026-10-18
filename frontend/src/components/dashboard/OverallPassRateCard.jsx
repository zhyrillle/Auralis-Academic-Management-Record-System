import DonutChart from '../charts/DonutChart';

export default function OverallPassRateCard({ data, loading }) {
  return <section className="dept-card dept-card-narrow dept-pass-chart">
    <h2 className="dept-card-title">Overall pass rate</h2>
    {loading ? <div className="dept-skeleton-ring" role="status" aria-label="Loading pass rate" /> : <>
      <DonutChart data={[{ id: 'passed', label: 'Passed', value: Number(data.passed), color: '#16a34a' },
        { id: 'failed', label: 'Failed', value: Number(data.failed), color: '#ef5350' }]}
        ariaLabel="Passed and failed learner counts" suffix="" centerValue={data.passRatePercentage + '%'} centerLabel="Pass rate" />
      <p className="dept-pass-chart-caption">Pass rate {data.passed} / {data.total} students</p>
    </>}
  </section>;
}
