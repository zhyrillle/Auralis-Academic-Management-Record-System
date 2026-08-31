import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  Users,
} from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import {
  getGradeLevelPerformance,
  principalPerformanceTerms,
} from "../../services/principalPerformanceService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import BarChart from "../../components/charts/BarChart";
import DonutChart from "../../components/charts/DonutChart";
import PerformanceFilters from "./performance-level/PerformanceFilters";
import PerformanceProgressTable, {
  PerformanceInlineProgress,
  PerformanceStatusBadge,
} from "./performance-level/PerformanceProgressTable";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";

const DEFAULT_YEAR = "2026-2027";

export default function PerformanceGradeLevels() {
  const [term, setTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    getGradeLevelPerformance({ term, schoolYear })
      .then((nextData) => {
        if (currentRequest === requestId.current) setData(nextData);
      })
      .catch((requestError) => {
        if (currentRequest === requestId.current)
          setError(
            requestError.message || "Unable to load grade-level performance.",
          );
      })
      .finally(() => {
        if (currentRequest === requestId.current) setRequestMode("idle");
      });
  }, [term, schoolYear, retryKey]);

  const changeFilter = (setter) => (value) => {
    setRequestMode("filtering");
    setError("");
    setter(value);
  };
  const retry = () => {
    setRequestMode(data ? "filtering" : "initial");
    setError("");
    setRetryKey((value) => value + 1);
  };

  if (requestMode === "initial" && !data) return <AnalyticsSkeleton table />;
  if (!data && error) {
    return (
      <main className="pa-page pp-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Grade-level performance is unavailable"
            description={error}
          />
          <button className="pa-retry-button" type="button" onClick={retry}>
            <RefreshCw size={16} />
            Retry
          </button>
        </section>
      </main>
    );
  }

  const isFiltering = requestMode === "filtering";
  const hasData = data.gradeLevels.length > 0;
  const schoolYearOptions = data.availableSchoolYears.map((year) => ({
    value: year.value,
    label: year.label,
  }));
  const statCards = [
    {
      label: "School-wide Average",
      value: data.summary.averageGrade,
      description: "Across all grade levels",
      icon: GraduationCap,
      tone: "navy",
    },
    {
      label: "Overall Pass Rate",
      value: `${data.summary.passRate}%`,
      description: `${data.summary.passingLearners} of ${data.summary.totalLearners} learners`,
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "Overall Fail Rate",
      value: `${data.summary.failRate}%`,
      description: `${data.summary.failingLearners} learners below passing`,
      icon: AlertTriangle,
      tone: "red",
    },
    {
      label: "Needs Attention",
      value: data.summary.needsAttention,
      description: "Grade levels requiring closer review",
      icon: Users,
      tone: "gold",
    },
  ];
  const columns = [
    { key: "label", label: "Grade Level" },
    { key: "learners", label: "Learners" },
    { key: "averageGrade", label: "Average Grade" },
    {
      key: "passRate",
      label: "Pass Rate",
      render: (row) => <PerformanceInlineProgress value={row.passRate} />,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <PerformanceStatusBadge value={row.status} />,
    },
  ];

  return (
    <main className="pa-page pp-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Performance by Grade Level</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
          </div>
          <p>
            Compare learner performance and passing outcomes across grade
            levels.
          </p>
        </div>
      </header>
      <PerformanceFilters
        terms={principalPerformanceTerms}
        term={term}
        onTermChange={changeFilter(setTerm)}
        schoolYears={schoolYearOptions}
        schoolYear={schoolYear}
        onSchoolYearChange={changeFilter(setSchoolYear)}
        disabled={isFiltering}
      />
      {error && data && (
        <div className="pa-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      <div
        className={`pa-content${isFiltering ? " is-busy" : ""}`}
        aria-busy={isFiltering}
      >
        {isFiltering && (
          <div
            className="pa-busy-overlay"
            role="status"
            aria-label="Updating performance data"
          >
            <span className="pa-spinner pa-spinner--large" />
          </div>
        )}
        {!hasData ? (
          <section className="pa-panel pa-state-panel">
            <EmptyState
              className="pa-empty-state"
              icon={GraduationCap}
              title="No grade-level results"
              description="No performance records match the selected filters."
            />
          </section>
        ) : (
          <>
            <section className="pa-stat-grid" aria-label="Grade-level summary">
              {statCards.map((card) => (
                <AnalyticsStatCard key={card.label} {...card} />
              ))}
            </section>
            <div className="pp-two-column pp-two-column--balanced">
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Average Grade by Grade Level</h2>
                    <p>School-wide comparison for the selected period.</p>
                  </div>
                </div>
                <BarChart
                  data={data.gradeLevels.map((item) => ({
                    id: item.id,
                    label: item.label,
                    shortLabel: item.shortLabel,
                    value: item.averageGrade,
                    detail: `${item.learners} learners`,
                  }))}
                  minimum={60}
                  maximum={100}
                  ariaLabel="Average grade by grade level"
                />
              </section>
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Overall Distribution</h2>
                    <p>Estimated passing and failing learner share.</p>
                  </div>
                </div>
                <DonutChart
                  ariaLabel="Overall pass and fail distribution"
                  centerLabel="Learners"
                  data={[
                    {
                      id: "pass",
                      label: "Passing",
                      value: data.summary.passRate,
                      color: "#168449",
                    },
                    {
                      id: "fail",
                      label: "Below passing",
                      value: data.summary.failRate,
                      color: "#c62828",
                    },
                  ]}
                />
              </section>
            </div>
            <PerformanceProgressTable
              title="Grade-Level Breakdown"
              subtitle="Learners, average grade, and passing outcomes by grade level."
              columns={columns}
              data={data.gradeLevels}
            />
          </>
        )}
      </div>
    </main>
  );
}
