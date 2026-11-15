import OverallDistributionChart from "../at-risk/OverallDistributionChart";
import GradeLevelBreakdownChart from "../at-risk/GradeLevelBreakdownChart";
import "../../styles/atRiskPrediction.css";
import "../../styles/atRiskBreakdown.css";

const bands = [
  { level: "low", label: "Low", color: "#168449" },
  { level: "medium", label: "Moderate", color: "#C27C20" },
  { level: "high", label: "High", color: "#C62828" },
];
export default function DepartmentRiskOverview({ query }) {
  const summary = query.data?.summary;
  const distribution = {
    high: { count: summary?.high || 0 },
    medium: { count: summary?.moderate || 0 },
    low: { count: summary?.low || 0 },
    totalFlagged: summary?.total || 0,
  };
  const breakdown =
    query.data?.byGrade.map((row) => ({ ...row, medium: row.moderate })) || [];
  return (
    <section
      className="dept-risk-overview"
      aria-label="Rule-based academic monitoring"
    >
      <header className="dept-risk-overview__header">
        <div>
          <h2>Academic risk overview</h2>
        </div>
      </header>
      {query.error && (
        <div className="dept-error-banner" role="alert">
          {String(query.error)}{" "}
          <button type="button" onClick={query.refresh}>
            Retry risk counts
          </button>
        </div>
      )}
      {(query.loading || query.data) && (
        <>
          <div className="ar-charts-row ar-charts-row--responsive">
            <OverallDistributionChart
              data={distribution}
              loading={query.loading}
              labels={{ low: "Low", medium: "Moderate", high: "High" }}
            />
            <GradeLevelBreakdownChart
              data={breakdown}
              gradeLevels={breakdown.map((row) => ({ value: row.grade }))}
              bands={bands}
              loading={query.loading}
              subtitle={query.term === 'ALL' ? 'All terms · One entry per learner per term' : 'Academic bands · Learners awaiting valid records excluded'}
              ariaLabel="Department academic risk by grade level"
              fillContainer
            />
          </div>
        </>
      )}
    </section>
  );
}
