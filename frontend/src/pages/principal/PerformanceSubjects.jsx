import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  RefreshCw,
  Target,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import {
  getSubjectPerformance,
  principalPerformanceTerms,
} from "../../services/principalPerformanceService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import BarChart from "../../components/charts/BarChart";
import PerformanceFilters from "./performance-level/PerformanceFilters";
import PerformanceProgressTable, {
  PerformanceInlineProgress,
  PerformanceStatusBadge,
} from "./performance-level/PerformanceProgressTable";
import RankedProgressList from "./performance-level/RankedProgressList";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";

const DEFAULT_YEAR = "2026-2027";

export default function PerformanceSubjects() {
  const [term, setTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [gradeLevel, setGradeLevel] = useState("all");
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    getSubjectPerformance({ term, schoolYear, gradeLevel })
      .then((nextData) => {
        if (currentRequest === requestId.current) setData(nextData);
      })
      .catch((requestError) => {
        if (currentRequest === requestId.current)
          setError(
            requestError.message || "Unable to load subject performance.",
          );
      })
      .finally(() => {
        if (currentRequest === requestId.current) setRequestMode("idle");
      });
  }, [term, schoolYear, gradeLevel, retryKey]);

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
            title="Subject performance is unavailable"
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
  const hasData = data.subjects.length > 0;
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
  const cards = [
    {
      label: "Total Subjects",
      value: data.summary.totalSubjects,
      description:
        gradeLevel === "all"
          ? "Across all grade levels"
          : `For Grade ${gradeLevel}`,
      icon: BookOpenCheck,
      tone: "navy",
    },
    {
      label: "Top Subject",
      value: data.summary.topSubject?.label || "—",
      description: data.summary.topSubject
        ? `Average ${data.summary.topSubject.averageGrade}`
        : "No data",
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "Lowest Subject",
      value: data.summary.lowestSubject?.label || "—",
      description: data.summary.lowestSubject
        ? `Average ${data.summary.lowestSubject.averageGrade}`
        : "No data",
      icon: AlertTriangle,
      tone: "red",
    },
    {
      label: "Below Target",
      value: data.summary.belowTarget,
      description: "Subjects below an average of 80",
      icon: Target,
      tone: "gold",
    },
  ];
  const columns = [
    { key: "label", label: "Subject" },
    { key: "averageGrade", label: "Average Grade" },
    {
      key: "passRate",
      label: "Pass Rate",
      render: (row) => <PerformanceInlineProgress value={row.passRate} />,
    },
    {
      key: "highestSection",
      label: "Highest Section",
      render: (row) => (
        <span>
          {row.highestSection.section.code}{" "}
          <b className="pp-positive">{row.highestSection.averageGrade}</b>
        </span>
      ),
    },
    {
      key: "lowestSection",
      label: "Lowest Section",
      render: (row) => (
        <span>
          {row.lowestSection.section.code}{" "}
          <b className="pp-negative">{row.lowestSection.averageGrade}</b>
        </span>
      ),
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
            <h1>Performance by Subject</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
          </div>
          <p>
            Compare average grades and passing outcomes across Junior High
            School subjects.
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
      >
        <label>
          <DropdownSelect
            label="Grade level"
            value={gradeLevel}
            options={gradeLevelOptions}
            onChange={changeFilter(setGradeLevel)}
            disabled={isFiltering}
          />
        </label>
      </PerformanceFilters>
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
              icon={BookOpenCheck}
              title="No subject results"
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
            <div className="pp-two-column pp-two-column--balanced">
              <section className="pa-panel pp-subject-chart-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Average Grade per Subject</h2>
                    <p>Subject comparison for the selected period.</p>
                  </div>
                </div>
                <BarChart
                  data={data.subjects.map((subject) => ({
                    id: subject.id,
                    label: subject.label,
                    shortLabel: subject.code,
                    value: subject.averageGrade,
                    color: subject.color,
                    detail: `${subject.passRate}% pass rate`,
                  }))}
                  minimum={60}
                  maximum={100}
                  height={420}
                  ariaLabel="Average grade per subject"
                />
              </section>
              <RankedProgressList
                title="Subject Performance Ranking"
                subtitle="Pass-rate comparison from strongest to weakest subject."
                items={[...data.subjects]
                  .sort((a, b) => b.passRate - a.passRate)
                  .map((subject) => ({
                    id: subject.id,
                    label: subject.label,
                    value: subject.passRate,
                    tone:
                      subject.status === "Needs attention"
                        ? "danger"
                        : subject.status === "Monitor"
                          ? "warning"
                          : "success",
                  }))}
                valueLabel="Pass rate"
                suffix="%"
              />
            </div>
            <PerformanceProgressTable
              title="Subject-Level Breakdown"
              subtitle="Average grade, pass rate, and strongest and weakest section per subject."
              columns={columns}
              data={data.subjects}
            />
          </>
        )}
      </div>
    </main>
  );
}
