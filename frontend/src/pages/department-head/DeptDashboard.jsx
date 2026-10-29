import { useState, useEffect, useMemo } from "react";
import FilterBar from "../../components/dashboard/FilterBar";
import ComparativeAnalysisCard from "../../components/dashboard/ComparativeAnalysisCard";
import OverallPassRateCard from "../../components/dashboard/OverallPassRateCard";
import StatCard from "../../components/common/StatCard";
import { Users, ClipboardCheck, Clock3, AlertTriangle } from "lucide-react";
import SubmissionMonitorTable from "../../components/dashboard/SubmissionMonitorTable";
import GradeDistributionTable from "../../components/dashboard/GradeDistributionTable";
import {
  getComparativeAnalysis,
  getOverallPassRate,
  getDashboardStats,
  getSubmissionMonitor,
  getGradeDistribution,
} from "../../services/dashboardApi";
import "../../styles/departmentHeadDashboard.css";
import "../../styles/departmentMonitoring.css";
import { useDepartmentContext } from "../../services/deptHeadMonitoringApi";

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
const EMPTY_DISTRIBUTION = [];

export default function DeptDashboard() {
  const context = useDepartmentContext();
  const departmentName = context.data?.department?.name;
  const [filters, setFilters] = useState({
    schoolYear: "",
    gradeLevel: "",
    quarter: "",
  });
  const defaultYear = (context.data?.schoolYears.find(year => year.isCurrent) || context.data?.schoolYears[0])?.label || '';
  const activeFilters = useMemo(() => ({ ...filters, schoolYear: filters.schoolYear || defaultYear }), [filters, defaultYear]);
  const [comparative, setComparative] = useState(EMPTY_COMPARATIVE);
  const [passRate, setPassRate] = useState(EMPTY_PASS_RATE);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [submissions, setSubmissions] = useState(EMPTY_SUBMISSIONS);
  const [distribution, setDistribution] = useState(EMPTY_DISTRIBUTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeFilters.schoolYear) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [comparativeData, passRateData, statsData, submissionsData, distributionData] =
          await Promise.all([
            getComparativeAnalysis(activeFilters).catch(() => EMPTY_COMPARATIVE),
            getOverallPassRate(activeFilters).catch(() => EMPTY_PASS_RATE),
            getDashboardStats(activeFilters).catch(() => EMPTY_STATS),
            getSubmissionMonitor(activeFilters).catch(() => EMPTY_SUBMISSIONS),
            getGradeDistribution({ schoolYear: activeFilters.schoolYear }).catch(() => EMPTY_DISTRIBUTION),
          ]);

        if (cancelled) return;

        setComparative(comparativeData);
        setPassRate(passRateData);
        setStats(statsData);
        setSubmissions(submissionsData);
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
  }, [activeFilters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="dept-dashboard-page dept-monitor-page">
      <div className="dept-dashboard-header">
        <div>
          <p className="dept-monitor-eyebrow">DEPARTMENT OVERVIEW</p>
          <h1 className="dept-dashboard-title">{departmentName ? `${departmentName} Department` : "Department Dashboard"}</h1>
          <p className="dept-dashboard-subtitle">Monitor submissions, performance, and grade distribution.</p>
        </div>
      </div>

      <FilterBar
        filters={activeFilters}
        onChange={handleFilterChange}
        disabled={loading}
        schoolYears={context.data?.schoolYears}
      />

      {(error || context.error) && <div className="dept-error-banner">{error || context.error}</div>}

      <div className="dept-dashboard-body">
        <div className="dept-main-cards">
          <ComparativeAnalysisCard
            departmentName={departmentName}
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
          <StatCard title="Total Teachers" value={stats.totalTeachers} description="Department wide" icon={Users} variant="info" />
          <StatCard title="Submitted Grades" value={stats.submittedGradesPercent + '%'} description={stats.submittedGrades + ' submitted'} icon={ClipboardCheck} variant="success" />
          <StatCard title="Delayed Submissions" value={stats.delayedSubmissions} description="Requires follow-up" icon={Clock3} variant="warning" />
          <StatCard title="At-Risk Students" value={stats.atRiskStudents} description="Need intervention" icon={AlertTriangle} variant="warning" />
        </div>

        <div className="dept-monitor-details">
        <SubmissionMonitorTable
          data={submissions}
          loading={loading}
          term={activeFilters.quarter}
          onTermChange={value => handleFilterChange('quarter', value)}
        />

        <GradeDistributionTable
          data={distribution}
          schoolYear={activeFilters.schoolYear}
          loading={loading}
        />
        </div>
      </div>
    </div>
  );
}
