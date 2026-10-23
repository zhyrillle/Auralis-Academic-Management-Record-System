import { usePrincipalQuery } from "../../services/principalData";
import FilterToolbar from "../../components/common/FilterToolbar";
import { mutedSeriesStyles } from "./analytics/principalChartStyles";
import { useMemo, useState } from "react";
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
import LineChart from "../../components/charts/LineChart";
import GroupedBarChart from "../../components/charts/GroupedBarChart";
import SubjectLegend from "./analytics/SubjectLegend";
import "../../styles/principalAnalytics.css";

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
  const [requestedYear, setSchoolYear] = useState("");
  const [gradeLevel, setGradeLevel] = useState("all");
  const [viewMode, setViewMode] = useState("trend");
  const [rankingTerm, setRankingTerm] = useState("term-1");
  const { data, loading, refreshing, error, refresh, schoolYear, schoolYears } = usePrincipalQuery(
    "analytics:subject-trend", { schoolYear: requestedYear, gradeLevel, term: viewMode === "trend" ? "overall" : rankingTerm }, getSubjectPerformanceTrend,
  );
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(null);


  const changeFilter = (setter) => (value) => setter(value);

  const handleRetry = refresh;

  const statistics = useMemo(() => {
    if (!data?.subjects.length) return [];
    if (data.term === "overall") {
      const changes = data.subjects.filter(subject => subject.termGradeCounts[0] > 0 && subject.termGradeCounts[2] > 0).map(
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
    const averages = data.subjects.filter(subject => subject.termGradeCounts[index] > 0).map(
      (subject) => subject.termAverages[index],
    );
    return [
      {
        label: "Total Subjects",
        value: averages.length,
        description: `With recorded grades in Term ${index + 1}`,
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
        value: averages.length ? round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : "—",
        description: `School-wide Term ${index + 1}`,
        icon: Scale,
        tone: "gold",
      },
    ];
  }, [data]);

  if (loading && !data) return <AnalyticsSkeleton />;

  if (!data) {
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

  const subjectStyles = mutedSeriesStyles(data.subjects);
  const selectedSubjects = data.subjects.filter((subject) =>
    (selectedSubjectIds === null || selectedSubjectIds.includes(subject.id)),
  );
  const schoolYearOptions = schoolYears;

  const rawGradeLevels = Array.isArray(data.availableGradeLevels)
    ? data.availableGradeLevels
    : [];
  const gradeLevelOptions = [
    { value: "all", label: "All grade levels" },
    ...rawGradeLevels
      .filter((lvl) =>
        typeof lvl === "object" && lvl !== null
          ? lvl.value !== "all"
          : String(lvl) !== "all"
      )
      .map((lvl) => {
        if (typeof lvl === "object" && lvl !== null) {
          return {
            value: String(lvl.value),
            label: lvl.label || `Grade ${lvl.value}`,
          };
        }
        return {
          value: String(lvl),
          label: `Grade ${lvl}`,
        };
      }),
  ];
  const isFiltering = refreshing;
  const displayedTerm = data.term;

  return (
    <main className="pa-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Subject Performance Trend</h1>
          </div>
          <p>
            Review average-grade movement by subject, term, grade level, and
            school year.
          </p>
        </div>
      </header>

      <FilterToolbar className="pa-navigation" label="Subject performance filters">
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
      </FilterToolbar>

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
                  <LineChart
                    ariaLabel="School-wide average grade across Terms 1 to 3"
                    labels={["Term 1", "Term 2", "Term 3"]}
                    showArea
                    series={[
                      {
                        id: "school-wide",
                        label: "School-wide average",
                        color: "#123062",
                        values: data.schoolWideAverages.map((value, index) => ({
                          value: data.schoolWideGradeCounts[index] > 0 ? value : null,
                          detail: `${data.totalLearners} learners`,
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
                    subjects={data.subjects.map(subject => ({ ...subject, ...subjectStyles.get(subject.id) }))}
                    selectedIds={selectedSubjectIds ?? data.subjects.map(subject => subject.id)}
                    onToggle={(id) =>
                      setSelectedSubjectIds((current) => {
                        const selected = current ?? data.subjects.map(subject => subject.id);
                        return selected.includes(id)
                          ? selected.filter(subjectId => subjectId !== id)
                          : [...selected, id];
                      })
                    }
                    onAll={() =>
                      setSelectedSubjectIds(
                        data.subjects.map((subject) => subject.id),
                      )
                    }
                    onNone={() => setSelectedSubjectIds([])}
                  />
                  {selectedSubjects.length ? (
                    <LineChart
                      ariaLabel="Average grade trend for selected subjects"
                      labels={["Term 1", "Term 2", "Term 3"]}
                      series={selectedSubjects.map((subject) => ({
                        ...subject,
                        ...subjectStyles.get(subject.id),
                        values: subject.termAverages.map((value, index) => ({
                          value: subject.termGradeCounts[index] > 0 ? value : null,
                          detail: `${subject.learnerCount} learners`,
                        })),
                      }))}
                    />
                  ) : (
                    <div className="pa-empty-chart">
                      <div className="pa-empty-chart__graph" aria-hidden="true">
                        <LineChart
                          ariaLabel="Empty subject trend chart"
                          labels={["Term 1", "Term 2", "Term 3"]}
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
                {data.subjects.some(subject => subject.termGradeCounts[termIndex(displayedTerm)] > 0) ? <GroupedBarChart
                  ariaLabel={`Subject average grades for Term ${termIndex(displayedTerm) + 1}`}
                  groups={[...data.subjects]
                    .filter(subject => subject.termGradeCounts[termIndex(displayedTerm)] > 0)
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
                          detail: `${subject.learnerCount} learners`,
                          color: "#123062",
                        },
                      ],
                    }))}
                /> : <EmptyState className="pa-empty-state" icon={BookOpenCheck} title="No recorded grades for this term" description="Choose a term with saved grades to view its ranking." />}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
