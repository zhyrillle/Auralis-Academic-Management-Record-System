import PageSkeleton, { SkeletonBlock, SkeletonCards, SkeletonChart, SkeletonTable } from '../../components/common/PageSkeleton';
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
const readResult = promise => promise.then(data => ({ data, error: null }), error => ({ data: null, error }));

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
  const [loadedContext, setLoadedContext] = useState(null);
  const contextKey = JSON.stringify(activeFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);

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
            readResult(getDashboardStats(activeFilters)),
            readResult(getSubmissionMonitor(activeFilters)),
            getGradeDistribution({ schoolYear: activeFilters.schoolYear }).catch(() => EMPTY_DISTRIBUTION),
          ]);

        if (cancelled) return;

        setComparative(comparativeData);
        setPassRate(passRateData);
        setStats(statsData.data || EMPTY_STATS);
        setStatsError(statsData.error);
        setSubmissions(submissionsData.data || EMPTY_SUBMISSIONS);
        setSubmissionError(submissionsData.error);
        setDistribution(distributionData);
        setLoadedContext(JSON.stringify(activeFilters));
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
  }, [activeFilters, retryVersion]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const contentLoading = !error && !context.error && (context.loading || (loadedContext !== contextKey && (loading || Boolean(activeFilters.schoolYear))));
  const bodySkeleton = <PageSkeleton label="Loading department dashboard">
    <div className="app-skeleton-charts"><SkeletonChart /><SkeletonChart round /></div>
    <SkeletonCards count={4} />
    <div className="dept-loading-details">
      <div className="dept-card dept-loading-submissions">
        <div className="dept-loading-header">
          <SkeletonBlock width={180} height={18} />
          <div className="dept-loading-controls"><SkeletonBlock /><SkeletonBlock /></div>
        </div>
        <SkeletonTable rows={6} columns={5} />
        <div className="dept-loading-pagination"><SkeletonBlock width={150} /><SkeletonBlock width={120} height={32} /></div>
      </div>
      <div className="dept-loading-report">
        <div className="dept-loading-report-header">
          <SkeletonBlock width={340} height={24} />
          <div className="dept-loading-report-filters"><SkeletonBlock width={65} /><SkeletonBlock width={150} height={38} /><SkeletonBlock width={115} height={38} /></div>
        </div>
        <SkeletonBlock width={190} height={16} />
        <div className="dept-loading-report-card"><SkeletonBlock width={170} height={18} /><SkeletonTable rows={5} columns={5} /></div>
        <div className="dept-loading-report-card"><SkeletonBlock width={140} height={18} /><SkeletonTable rows={5} columns={7} /></div>
      </div>
    </div>
  </PageSkeleton>;

  return (
    <div className="dept-dashboard-page dept-monitor-page">
      <div className="dept-dashboard-header">
        <div>
          <h1 className="dept-dashboard-title">{departmentName ? `${departmentName} Department` : "Department Dashboard"}</h1>
          <p className="dept-dashboard-subtitle">Monitor submissions, performance, and grade distribution.</p>
        </div>
      </div>

      <FilterBar
        filters={activeFilters}
        onChange={handleFilterChange}
        disabled={loading || context.loading}
        loadingOptions={context.loading}
        schoolYears={context.data?.schoolYears}
      />

      {(error || context.error) && <div className="dept-error-banner">{error || context.error}</div>}

      <div aria-busy={contentLoading}>
        {contentLoading && bodySkeleton}
        {/* Preserve report selections while a different dashboard context loads. */}
        {loadedContext !== null && <div className="dept-dashboard-body" hidden={contentLoading} style={contentLoading ? { display: 'none' } : undefined}>
        <div className="dept-main-cards">
          <ComparativeAnalysisCard
            departmentName={departmentName}
            data={comparative}
            loading={loading || context.loading}
            error={!loading && comparative.length === 0 ? null : undefined}
          />
          <OverallPassRateCard
            data={passRate}
            loading={loading || context.loading}
          />
        </div>

        {statsError && !loading && <div className="dept-error-banner" role="alert">
          Couldn’t load dashboard counts. <button type="button" onClick={() => setRetryVersion(value => value + 1)}>Retry counts</button>
        </div>}
        <div className="dept-stats-row">
          <StatCard loading={loading || context.loading} title="Total Teachers" value={statsError || loading ? '—' : stats.totalTeachers} description="Department wide" icon={Users} variant="info" />
          <StatCard loading={loading || context.loading} title="Submitted Grades" value={statsError || loading ? '—' : stats.submittedGradesPercent + '%'} description={statsError || loading ? 'Submission count unavailable' : stats.submittedGrades + ' submitted'} icon={ClipboardCheck} variant="success" />
          <StatCard loading={loading || context.loading} title="Delayed Submissions" value={statsError || loading ? '—' : stats.delayedSubmissions} description="Past deadline, not submitted" icon={Clock3} variant="warning" />
          <StatCard loading={loading || context.loading} title="At-Risk Students" value={statsError || loading ? '—' : stats.atRiskStudents} description="Need intervention" icon={AlertTriangle} variant="warning" />
        </div>

        <div className="dept-monitor-details">
        <SubmissionMonitorTable
          data={submissions}
          loading={loading || context.loading}
          error={submissionError}
          onRetry={() => setRetryVersion(value => value + 1)}
          term={activeFilters.quarter}
          onTermChange={value => handleFilterChange('quarter', value)}
        />

        <GradeDistributionTable
          data={distribution}
          schoolYear={activeFilters.schoolYear}
          loading={loading || context.loading}
        />
        </div>
        </div>}
      </div>
    </div>
  );
}
