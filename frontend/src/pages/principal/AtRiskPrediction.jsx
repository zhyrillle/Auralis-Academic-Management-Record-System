import { ChartColumn } from 'lucide-react';
import PredictionLearnerList from '../../components/at-risk/PredictionLearnerList';
import OverallDistributionChart from '../../components/at-risk/OverallDistributionChart';
import GradeLevelBreakdownChart from '../../components/at-risk/GradeLevelBreakdownChart';
import EmptyState from '../../components/common/EmptyState';
import { AtRiskFilters, AtRiskStats, AtRiskAvailability } from '../../components/at-risk/AtRiskOverview';
import useAtRiskPreview from '../../services/useAtRiskPreview';
import '../../styles/atRiskPrediction.css';
import '../../styles/atRiskBreakdown.css';
import '../../styles/modelPreview.css';

export default function AtRiskPrediction() {
  const preview = useAtRiskPreview();
  const { data, loading, error, filterQuery } = preview;
  return <div className="ar-page ar-prediction-page">
    <div className="ar-header"><div>
      <h1 className="ar-title">Student Risk Review</h1>
      <p className="ar-subtitle">Preliminary next-term predictions · English only</p>
    </div></div>
    <AtRiskFilters preview={preview} />
    {error ? <div className="ar-preview-error" role="alert">
      <strong>Prediction unavailable</strong><p>{error}</p><button type="button" onClick={preview.retry}>Retry</button>
    </div> : <>
      <AtRiskStats data={data} loading={loading} />
      <AtRiskAvailability data={data} origin="prediction" filterQuery={filterQuery} />
      {!loading && data && !data.students.length
        ? <EmptyState className="ar-preview-empty pa-empty-state" icon={ChartColumn}
          title="No predictions for this period"
          description="Predictions require complete English grades, source-term attendance and valid PHIL-IRI screening. View records needed for details." />
        : <section className="ar-charts-row" aria-label="Risk distribution breakdown">
          <OverallDistributionChart data={data?.distribution} loading={loading} />
          <GradeLevelBreakdownChart data={data?.gradeBreakdown} gradeLevels={preview.options?.gradeLevels} loading={loading} />
        </section>}
      <PredictionLearnerList data={data} loading={loading} filterQuery={filterQuery} />
    </>}
  </div>;
}
