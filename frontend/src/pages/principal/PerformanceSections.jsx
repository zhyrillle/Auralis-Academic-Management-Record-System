import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LayoutGrid,
  RefreshCw,
  Users,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import {
  getSectionPerformance,
  principalPerformanceTerms,
} from "../../services/principalPerformanceService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import PerformanceFilters from "./performance-level/PerformanceFilters";
import PerformanceProgressTable, {
  PerformanceStatusBadge,
} from "./performance-level/PerformanceProgressTable";
import RankedProgressList from "./performance-level/RankedProgressList";
import PerformanceSearch from "./performance-level/PerformanceSearch";
import StackedBarChart from "../../components/charts/StackedBarChart";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";

const DEFAULT_YEAR = "2026-2027";
const PERFORMANCE_BANDS = [
  { id: "needsAttention", label: "Needs Attention", color: "#ef5350" },
  { id: "satisfactory", label: "Satisfactory", color: "#f6b91b" },
  {
    id: "verySatisfactory",
    label: "Very Satisfactory",
    color: "#2db783",
  },
  { id: "outstanding", label: "Outstanding", color: "#6366e8" },
];
const matchesSearch = (section, query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [section.label, section.section, `grade ${section.gradeLevel}`]
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
};

export default function PerformanceSections() {
  const [term, setTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [distributionQuery, setDistributionQuery] = useState("");
  const [distributionGradeLevel, setDistributionGradeLevel] = useState("all");
  const [tableQuery, setTableQuery] = useState("");
  const [tableGradeLevel, setTableGradeLevel] = useState("all");
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    getSectionPerformance({ term, schoolYear })
      .then((nextData) => {
        if (currentRequest === requestId.current) setData(nextData);
      })
      .catch((requestError) => {
        if (currentRequest === requestId.current)
          setError(
            requestError.message || "Unable to load section performance.",
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
  if (!data && error)
    return (
      <main className="pa-page pp-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Section performance is unavailable"
            description={error}
          />
          <button className="pa-retry-button" type="button" onClick={retry}>
            <RefreshCw size={16} />
            Retry
          </button>
        </section>
      </main>
    );

  const isFiltering = requestMode === "filtering";
  const hasData = data.sections.length > 0;
  const schoolYearOptions = data.availableSchoolYears.map((year) => ({
    value: year.value,
    label: year.label,
  }));
  const gradeLevelOptions = [
    { value: "all", label: "All grade levels" },
    ...data.availableGradeLevels.map((level) => ({
      value: String(level),
      label: `Grade ${level}`,
    })),
  ];
  const distributionSections = data.sections.filter(
    (section) =>
      matchesSearch(section, distributionQuery) &&
      (distributionGradeLevel === "all" ||
        section.gradeLevel === Number(distributionGradeLevel)),
  );
  const tableSections = data.sections.filter(
    (section) =>
      matchesSearch(section, tableQuery) &&
      (tableGradeLevel === "all" ||
        section.gradeLevel === Number(tableGradeLevel)),
  );
  const cards = [
    {
      label: "School-wide Average",
      value: data.summary.averageGrade,
      description: "Across all sections",
      icon: LayoutGrid,
      tone: "navy",
    },
    {
      label: "Overall Pass Rate",
      value: `${data.summary.passRate}%`,
      description: `${data.summary.passingLearners} learners passing`,
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
      description: "Sections requiring closer review",
      icon: Users,
      tone: "gold",
    },
  ];
  const columns = [
    {
      key: "gradeLevel",
      label: "Grade Level",
      render: (row) => `Grade ${row.gradeLevel}`,
    },
    { key: "section", label: "Section" },
    { key: "learners", label: "Learners" },
    { key: "averageGrade", label: "Average Grade" },
    {
      key: "passRate",
      label: "Pass Rate",
      render: (row) => `${row.passRate}%`,
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
            <h1>Performance by Section</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
          </div>
          <p>
            Compare average grades and performance bands across school sections.
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
              icon={LayoutGrid}
              title="No section results"
              description="No performance records match the selected filters."
            />
          </section>
        ) : (
          <>
            <section className="pa-stat-grid">
              {cards.map((card) => (
                <AnalyticsStatCard key={card.label} {...card} />
              ))}
            </section>
            <div className="pp-two-column pp-two-column--sections">
              <RankedProgressList
                title="Sections by Performance Band"
                subtitle="Number of sections in each four-band classification."
                valueLabel="Section count"
                items={data.bands.map((band) => ({
                  id: band.id,
                  label: band.label,
                  value: band.count,
                  tone:
                    band.id === "needs-attention"
                      ? "danger"
                      : band.id === "satisfactory"
                        ? "warning"
                        : "neutral",
                }))}
              />
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Grade Band Distribution by Section</h2>
                    <p>Share of learners in each performance band.</p>
                  </div>
                  <div className="pp-panel-controls">
                    <PerformanceSearch
                      value={distributionQuery}
                      onChange={setDistributionQuery}
                      placeholder="Search sections…"
                      label="Search grade distribution sections"
                      disabled={isFiltering}
                    />
                    <div className="pp-grade-filter">
                      <DropdownSelect
                        className="pp-grade-filter__select"
                        label="Filter grade distribution by grade level"
                        value={distributionGradeLevel}
                        options={gradeLevelOptions}
                        onChange={setDistributionGradeLevel}
                        disabled={isFiltering}
                      />
                    </div>
                  </div>
                </div>
                <StackedBarChart
                  ariaLabel="Grade band distribution by section"
                  legendItems={PERFORMANCE_BANDS}
                  maxVisibleGroups={10}
                  emptyMessage="No sections match the current search and grade-level filter."
                  groups={distributionSections.map((section) => ({
                    id: section.id,
                    label: section.label,
                    displayValue: section.averageGrade,
                    segments: PERFORMANCE_BANDS.map((band) => ({
                      ...band,
                      value: section.distribution[band.id],
                    })),
                  }))}
                />
              </section>
            </div>
            <PerformanceProgressTable
              title="Section Performance Table"
              subtitle="Learners and performance outcomes across sections."
              columns={columns}
              data={tableSections}
              maxVisibleRows={10}
              controls={
                <>
                  <PerformanceSearch
                    value={tableQuery}
                    onChange={setTableQuery}
                    placeholder="Search table…"
                    label="Search section performance table"
                    disabled={isFiltering}
                  />
                  <div className="pp-grade-filter">
                    <DropdownSelect
                      className="pp-grade-filter__select"
                      label="Filter table by grade level"
                      value={tableGradeLevel}
                      options={gradeLevelOptions}
                      onChange={setTableGradeLevel}
                      disabled={isFiltering}
                    />
                  </div>
                </>
              }
              emptyMessage="No sections match the current search and grade-level filter."
            />
          </>
        )}
      </div>
    </main>
  );
}
