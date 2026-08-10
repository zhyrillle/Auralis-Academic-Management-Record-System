import { useState, useEffect } from "react";
import FilterBar from "../../components/dashboard/FilterBar";
import ComparativeAnalysisCard from "../../components/dashboard/ComparativeAnalysisCard";
import OverallPassRateCard from "../../components/dashboard/OverallPassRateCard";
import StatCard from "../../components/dashboard/StatCard";
import SubmissionMonitorTable from "../../components/dashboard/SubmissionMonitorTable";
import PerformanceMatrixTable from "../../components/dashboard/PerformanceMatrixTable";
import GradeDistributionTable from "../../components/dashboard/GradeDistributionTable";
import {
  getComparativeAnalysis,
  getOverallPassRate,
  getDashboardStats,
  getSubmissionMonitor,
  getPerformanceMatrix,
  getGradeDistribution,
} from "../../services/dashboardApi";
import "../../styles/departmentHeadDashboard.css";

const EMPTY_COMPARATIVE = [];
const EMPTY_PASS_RATE = { passed: 0, failed: 0, total: 0, passRatePercentage: 0 };
const EMPTY_STATS = {
  totalTeachers: 0,
  submittedGrades: 0,
  submittedGradesPercent: 0,
  delayedSubmissions: 0,
  atRiskStudents: 0,
};
const EMPTY_SUBMISSIONS = [];
const EMPTY_MATRIX = [];
const EMPTY_DISTRIBUTION = [];

export default function DeptDashboard() {
  const [filters, setFilters] = useState({
    schoolYear: "",
    gradeLevel: "",
    quarter: "",
  });
  const [comparative, setComparative] = useState(EMPTY_COMPARATIVE);
  const [passRate, setPassRate] = useState(EMPTY_PASS_RATE);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [submissions, setSubmissions] = useState(EMPTY_SUBMISSIONS);
  const [matrix, setMatrix] = useState(EMPTY_MATRIX);
  const [distribution, setDistribution] = useState(EMPTY_DISTRIBUTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [comparativeData, passRateData, statsData, submissionsData, matrixData, distributionData] =
          await Promise.all([
            getComparativeAnalysis(filters).catch(() => EMPTY_COMPARATIVE),
            getOverallPassRate(filters).catch(() => EMPTY_PASS_RATE),
            getDashboardStats(filters).catch(() => EMPTY_STATS),
            getSubmissionMonitor(filters).catch(() => EMPTY_SUBMISSIONS),
            getPerformanceMatrix(filters).catch(() => EMPTY_MATRIX),
            getGradeDistribution({ schoolYear: filters.schoolYear }).catch(() => EMPTY_DISTRIBUTION),
          ]);

        if (cancelled) return;

        setComparative(comparativeData);
        setPassRate(passRateData);
        setStats(statsData);
        setSubmissions(submissionsData);
        setMatrix(matrixData);
        setDistribution(distributionData);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="dept-dashboard-page">
      <div className="dept-dashboard-header">
        <div>
          <h1 className="dept-dashboard-title">Department Head - English</h1>
          <p className="dept-dashboard-subtitle">Monitor submissions, performance, and grade distribution.</p>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleFilterChange}
        disabled={loading}
      />

      {error && <div className="dept-error-banner">{error}</div>}

      <div className="dept-dashboard-body">
        <div className="dept-main-cards">
          <ComparativeAnalysisCard
            data={comparative}
            loading={loading}
            error={!loading && comparative.length === 0 ? null : undefined}
          />
          <OverallPassRateCard
            data={passRate}
            loading={loading}
          />
        </div>

        <div className="dept-stats-row">
          <StatCard
            title="Total Teachers"
            value={stats.totalTeachers}
            caption="Department Wide"
            accentColor="#0033C4"
          />
          <StatCard
            title="Submitted Grades"
            value={`${stats.submittedGradesPercent}%`}
            caption={
              <span className="dept-stat-caption-inline">
                {stats.submittedGrades} submitted
                <div className="dept-stat-progress-track">
                  <div
                    className="dept-stat-progress-fill"
                    style={{ width: `${stats.submittedGradesPercent}%` }}
                  />
                </div>
              </span>
            }
            accentColor="#0033C4"
          />
          <StatCard
            title="Delayed Submissions"
            value={stats.delayedSubmissions}
            caption="Requires follow-up"
            accentColor="#EF4444"
          />
          <StatCard
            title="At-Risk Students"
            value={stats.atRiskStudents}
            caption="Need intervention"
            accentColor="#F4B400"
          />
        </div>

        <SubmissionMonitorTable
          data={submissions}
          loading={loading}
        />

        <PerformanceMatrixTable
          data={matrix}
          loading={loading}
        />

        <GradeDistributionTable
          data={distribution}
          schoolYear={filters.schoolYear}
          loading={loading}
        />
      </div>
    </div>
  );
}
