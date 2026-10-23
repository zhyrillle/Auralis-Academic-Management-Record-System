import { usePrincipalQuery } from "../../services/principalData";
import { useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  GraduationCap,
  RefreshCw,
  Users,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import {
  getLowestPerformers,
  principalPerformanceTerms,
} from "../../services/principalPerformanceService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import BarChart from "../../components/charts/BarChart";
import PerformanceFilters from "./performance-level/PerformanceFilters";
import { hasRecordedGrades } from "./analytics/principalChartStyles";
import RankedProgressList from "./performance-level/RankedProgressList";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";


export default function PerformanceLowest() {
  const [term, setTerm] = useState("overall");
  const [requestedYear, setSchoolYear] = useState("");
  const [gradeLevel, setGradeLevel] = useState("all");
  const { data, loading, refreshing, error, refresh, schoolYear, schoolYears } = usePrincipalQuery(
    "performance:lowest", { term, schoolYear: requestedYear, gradeLevel }, getLowestPerformers,
  );


  const changeFilter = (setter) => (value) => setter(value);
  const retry = refresh;

  if (loading && !data) return <AnalyticsSkeleton table />;
  if (!data)
    return (
      <main className="pa-page pp-page">
        <section className="pa-state-panel">
          <EmptyState
            className="pa-empty-state"
            icon={AlertTriangle}
            title="Lowest-performer data is unavailable"
            description={error}
          />
          <button className="pa-retry-button" type="button" onClick={retry}>
            <RefreshCw size={16} />
            Retry
          </button>
        </section>
      </main>
    );

  const isFiltering = refreshing;
  // Empty results never generate placeholder rankings.
  const hasData =
    [...data.gradeLevels, ...data.sections, ...data.subjects].some(hasRecordedGrades);
  const schoolYearOptions = schoolYears.map((year) => ({
    value: year.value,
    label: year.label,
  }));
  const gradeOptions = [
    { value: "all", label: "All grade levels" },
    ...data.availableGradeLevels.map((level) => ({
      value: String(level),
      label: `Grade ${level}`,
    })),
  ];
  const lowestCard = (item) => ({
    value: item?.label || "—",
    description: item ? `Average ${item.averageGrade}` : "No data",
  });
  const cards = [
    {
      label: "Lowest Grade Level",
      ...lowestCard(data.summary?.lowestGradeLevel),
      icon: GraduationCap,
      tone: "navy",
    },
    {
      label: "Lowest Section",
      ...lowestCard(data.summary?.lowestSection),
      icon: Users,
      tone: "green",
    },
    {
      label: "Lowest Subject",
      ...lowestCard(data.summary?.lowestSubject),
      icon: BookOpenCheck,
      tone: "red",
    },
    {
      label: "At-Risk Students",
      value: data.summary?.atRiskStudents ?? 0,
      description: "Learners with a general average below 75",
      icon: AlertTriangle,
      tone: "gold",
    },
  ];
  const toRanked = (items) =>
    items
      .filter(hasRecordedGrades)
      .map((item) => ({
        id: item.id,
        label: item.label,
        value: item.averageGrade,
        tone: "blue",
      }));
  const gradedGradeLevels = toRanked(data.gradeLevels);
  const rankedGradeLevels = gradedGradeLevels;

  const gradedSections = toRanked(data.sections);
  const rankedSections = gradedSections;

  const gradedSubjects = toRanked(data.subjects);
  const rankedSubjects = gradedSubjects;

  return (
    <main className="pa-page pp-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Lowest Performers</h1>
          </div>
          <p>
            Identify grade levels, sections, and subjects requiring immediate
            academic support.
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
            options={gradeOptions}
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
              icon={AlertTriangle}
              title="No lowest-performer results"
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
            <div className="pp-lowest-grid">
              <RankedProgressList
                className="pp-lowest-grid__grade-levels"
                title="Lowest Grade Levels"
                items={rankedGradeLevels}
              />
              <RankedProgressList
                className="pp-lowest-grid__subjects"
                title="Lowest Subjects"
                items={rankedSubjects}
              />
              <RankedProgressList
                className="pp-lowest-grid__sections"
                title="Lowest Section Ranking"
                items={rankedSections}
                maxItems={10}
              />
            </div>
            <div className="pp-two-column pp-two-column--charts">
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Fail Rate Comparison</h2>
                    <p>
                      Estimated share of learners below passing by grade level.
                    </p>
                  </div>
                </div>
                <BarChart
                  data={data.gradeLevels.map((item) => ({
                    id: item.id,
                    label: item.label,
                    shortLabel: `G${item.gradeLevel}`,
                    value: hasRecordedGrades(item) ? Number(item.failRate) : null,
                    color: "#C27C20",
                  }))}
                  minimum={0}
                  maximum={Math.max(
                    40,
                    Math.ceil(
                      Math.max(0, ...data.gradeLevels.map((item) => Number(item.failRate ?? 0))) / 10,
                    ) * 10,
                  )}
                  suffix="%"
                  ariaLabel="Fail rate by grade level"
                />
              </section>
              <section className="pa-panel">
                <div className="pa-panel__header">
                  <div>
                    <h2>Average Grade per Subject</h2>
                    <p>
                      School-wide subject comparison for the selected period.
                    </p>
                  </div>
                </div>
                <BarChart
                  data={data.subjects.map((item) => ({
                    id: item.id,
                    label: item.label,
                    shortLabel: item.code,
                    value: hasRecordedGrades(item) ? item.averageGrade : null,
                    color: "#123062",
                  }))}
                  minimum={60}
                  maximum={100}
                  ariaLabel="Average grade by subject"
                />
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
