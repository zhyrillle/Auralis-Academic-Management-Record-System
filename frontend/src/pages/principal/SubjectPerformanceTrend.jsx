import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import {
  getSubjectPerformanceTrend,
  principalAnalyticsTerms,
} from "../../services/principalAnalyticsService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import AnalyticsTermTabs from "./analytics/AnalyticsTermTabs";
import AverageLineChart from "./analytics/AverageLineChart";
import SubjectBarChart from "./analytics/SubjectBarChart";
import SubjectLegend from "./analytics/SubjectLegend";
import "../../styles/principalAnalytics.css";

const DEFAULT_YEAR = "2026-2027";
const ANALYTICS_MODES = [
  { id: "trend", label: "Trend" },
  { id: "ranking", label: "Ranking" },
];
const RANKING_TERMS = principalAnalyticsTerms
  .filter((option) => option.id !== "overall")
  .map((option, index) => ({ ...option, label: `T${index + 1}` }));
const round = (value) => Math.round(value * 10) / 10;
const termIndex = (term) => Number(term.split("-")[1]) - 1;

export default function SubjectPerformanceTrend() {
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [gradeLevel, setGradeLevel] = useState("all");
  const [viewMode, setViewMode] = useState("trend");
  const [rankingTerm, setRankingTerm] = useState("term-1");
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;

    getSubjectPerformanceTrend({
      schoolYear,
      gradeLevel,
      term: viewMode === "trend" ? "overall" : rankingTerm,
    })
      .then((nextData) => {
        if (currentRequest !== requestId.current) return;
        setData(nextData);
        setSelectedSubjectIds((current) =>
          current === null
            ? nextData.subjects.map((subject) => subject.id)
            : current.filter((id) =>
                nextData.subjects.some((subject) => subject.id === id),
              ),
        );
      })
      .catch((requestError) => {
        if (currentRequest !== requestId.current) return;
        setError(
          requestError.message ||
            "Unable to load subject performance analytics.",
        );
      })
      .finally(() => {
        if (currentRequest === requestId.current) setRequestMode("idle");
      });
  }, [schoolYear, gradeLevel, viewMode, rankingTerm, retryKey]);

  const changeFilter = (setter) => (nextValue) => {
    setRequestMode("filtering");
    setError("");
    setter(nextValue);
  };

  const handleRetry = () => {
    setRequestMode(data ? "filtering" : "initial");
    setError("");
    setRetryKey((key) => key + 1);
  };

  const statistics = useMemo(() => {
    if (!data?.subjects.length) return [];
    if (data.term === "overall") {
      const changes = data.subjects.map(
        (subject) => subject.termAverages[2] - subject.termAverages[0],
      );
      return [
        {
          label: "Total Subjects",
          value: data.subjects.length,
          description: "Included in this view",
          icon: BookOpenCheck,
          tone: "navy",
        },
        {
          label: "Improving",
          value: changes.filter((change) => change > 1).length,
          description: "Gained more than 1 point",
          icon: TrendingUp,
          tone: "green",
        },
        {
          label: "Declining",
          value: changes.filter((change) => change < -1).length,
          description: "Lost more than 1 point",
          icon: TrendingDown,
          tone: "red",
        },
        {
          label: "Stable",
          value: changes.filter((change) => Math.abs(change) <= 1).length,
          description: "Within ±1 point",
          icon: Scale,
          tone: "gold",
        },
      ];
    }

    const index = termIndex(data.term);
    const averages = data.subjects.map(
      (subject) => subject.termAverages[index],
    );
    return [
      {
        label: "Total Subjects",
        value: data.subjects.length,
        description: `Included in Term ${index + 1}`,
        icon: BookOpenCheck,
        tone: "navy",
      },
      {
        label: "Above Passing",
        value: averages.filter((value) => value >= 75).length,
        description: "Average grade of 75 or higher",
        icon: CheckCircle2,
        tone: "green",
      },
      {
        label: "Below Passing",
        value: averages.filter((value) => value < 75).length,
        description: "Requires closer review",
        icon: AlertTriangle,
        tone: "red",
      },
      {
        label: "Term Average",
        value: round(
          averages.reduce((sum, value) => sum + value, 0) / averages.length,
        ),
        description: `School-wide Term ${index + 1}`,
        icon: Scale,
        tone: "gold",
      },
    ];
  }, [data]);

  if (requestMode === "initial" && !data) return <AnalyticsSkeleton />;

  if (!data && error) {
    return (
      <main className="pa-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Subject analytics are unavailable"
            description={error}
          />
          <button
            className="pa-retry-button"
            type="button"
            onClick={handleRetry}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </section>
      </main>
    );
  }

  const selectedSubjects = data.subjects.filter((subject) =>
    selectedSubjectIds?.includes(subject.id),
  );
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
  const isFiltering = requestMode === "filtering";
  const displayedTerm = data.term;

  return (
    <main className="pa-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Subject Performance Trend</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
          </div>
          <p>
            Review average-grade movement by subject, term, grade level, and
            school year.
          </p>
        </div>
      </header>

      <section
        className="pa-filter-bar"
        aria-label="Subject performance filters"
      >
        <AnalyticsTermTabs
          options={ANALYTICS_MODES}
          value={viewMode}
          onChange={changeFilter(setViewMode)}
          disabled={isFiltering}
          ariaLabel="Analytics view"
          className="pa-mode-tabs"
        />
        <div className="pa-filter-controls">
          <label>
            <DropdownSelect
              label="Grade level"
              value={gradeLevel}
              options={gradeLevelOptions}
              onChange={changeFilter(setGradeLevel)}
              disabled={isFiltering}
            />
          </label>
          <label>
            <DropdownSelect
              label="School year"
              value={schoolYear}
              options={schoolYearOptions}
              onChange={changeFilter(setSchoolYear)}
              disabled={isFiltering}
            />
          </label>
        </div>
      </section>

      {error && data && (
        <div className="pa-inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleRetry}>
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
            aria-label="Updating analytics"
          >
            <span className="pa-spinner pa-spinner--large" />
          </div>
        )}

        {!data.subjects.length ? (
          <section className="pa-state-panel">
            <EmptyState
              className="pa-empty-state"
              icon={BookOpenCheck}
              title="No subject results found"
              description="Try another school year or grade level."
            />
          </section>
        ) : (
          <>
            <section
              className="pa-stat-grid"
              aria-label="Subject performance summary"
            >
              {statistics.map((statistic) => (
                <AnalyticsStatCard key={statistic.label} {...statistic} />
              ))}
            </section>

            {displayedTerm === "overall" ? (
              <>
                <section className="pa-panel">
                  <div className="pa-panel__header">
                    <div>
                      <h2>School-wide Average Grade</h2>
                      <p>
                        Combined subject performance across all three terms.
                      </p>
                    </div>
                  </div>
                  <AverageLineChart
                    ariaLabel="School-wide average grade across Terms 1 to 3"
                    showArea
                    series={[
                      {
                        id: "school-wide",
                        label: "School-wide average",
                        color: "#17376d",
                        values: data.schoolWideAverages.map((value) => ({
                          value,
                          learnerCount: data.totalLearners,
                        })),
                      },
                    ]}
                  />
                </section>

                <section className="pa-panel">
                  <div className="pa-panel__header">
                    <div>
                      <h2>All Subjects</h2>
                      <p>
                        Select subjects in the legend to compare their movement.
                      </p>
                    </div>
                  </div>
                  <SubjectLegend
                    subjects={data.subjects}
                    selectedIds={selectedSubjectIds || []}
                    onToggle={(id) =>
                      setSelectedSubjectIds((current) =>
                        current.includes(id)
                          ? current.filter((subjectId) => subjectId !== id)
                          : [...current, id],
                      )
                    }
                    onAll={() =>
                      setSelectedSubjectIds(
                        data.subjects.map((subject) => subject.id),
                      )
                    }
                    onNone={() => setSelectedSubjectIds([])}
                  />
                  {selectedSubjects.length ? (
                    <AverageLineChart
                      ariaLabel="Average grade trend for selected subjects"
                      series={selectedSubjects.map((subject) => ({
                        ...subject,
                        values: subject.termAverages.map((value) => ({
                          value,
                          learnerCount: subject.learnerCount,
                        })),
                      }))}
                    />
                  ) : (
                    <div className="pa-empty-chart">
                      <div className="pa-empty-chart__graph" aria-hidden="true">
                        <AverageLineChart
                          ariaLabel="Empty subject trend chart"
                          series={[]}
                        />
                      </div>
                      <div className="pa-empty-chart__message" role="status">
                        Select at least one subject to display its trend.
                      </div>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Term {termIndex(displayedTerm) + 1} Subject Ranking</h2>
                    <p>
                      Subject average grades ranked against the DepEd passing
                      grade of 75.
                    </p>
                  </div>
                  <div className="pa-ranking-term-tabs">
                    <span>View term</span>
                    <AnalyticsTermTabs
                      options={RANKING_TERMS}
                      value={rankingTerm}
                      onChange={changeFilter(setRankingTerm)}
                      disabled={isFiltering}
                      ariaLabel="Ranking term"
                    />
                  </div>
                </div>
                <SubjectBarChart
                  ariaLabel={`Subject average grades for Term ${termIndex(displayedTerm) + 1}`}
                  groups={[...data.subjects]
                    .sort(
                      (a, b) =>
                        b.termAverages[termIndex(displayedTerm)] -
                        a.termAverages[termIndex(displayedTerm)],
                    )
                    .map((subject) => ({
                      id: subject.id,
                      label: subject.label,
                      shortLabel: subject.code,
                      values: [
                        {
                          id: `${subject.id}-${displayedTerm}`,
                          label: `Term ${termIndex(displayedTerm) + 1}`,
                          value: subject.termAverages[termIndex(displayedTerm)],
                          learnerCount: subject.learnerCount,
                          color: subject.color,
                        },
                      ],
                    }))}
                />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
