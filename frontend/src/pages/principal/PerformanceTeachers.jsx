import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  Users,
} from "lucide-react";
import EmptyState from "../../components/common/EmptyState";
import {
  getTeacherPerformance,
  principalPerformanceTerms,
} from "../../services/principalPerformanceService";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import LineChart from "../../components/charts/LineChart";
import PerformanceFilters from "./performance-level/PerformanceFilters";
import PerformanceProgressTable, {
  PerformanceInlineProgress,
  PerformanceStatusBadge,
} from "./performance-level/PerformanceProgressTable";
import RankedProgressList from "./performance-level/RankedProgressList";
import PerformanceSearch from "./performance-level/PerformanceSearch";
import SubjectLegend from "./analytics/SubjectLegend";
import "../../styles/principalAnalytics.css";
import "../../styles/principalPerformance.css";

const DEFAULT_YEAR = "2026-2027";
const matchesTeacher = (teacher, query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    teacher.name,
    teacher.subject,
    teacher.subjectCode,
    ...teacher.assignments,
  ].some((value) => String(value).toLowerCase().includes(normalizedQuery));
};

export default function PerformanceTeachers() {
  const [term, setTerm] = useState("overall");
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [data, setData] = useState(null);
  const [requestMode, setRequestMode] = useState("initial");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [rankingQuery, setRankingQuery] = useState("");
  const [submissionQuery, setSubmissionQuery] = useState("");
  const [chartQuery, setChartQuery] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    getTeacherPerformance({ term, schoolYear })
      .then((nextData) => {
        if (currentRequest !== requestId.current) return;
        setData(nextData);
        setSelectedTeacherIds((current) =>
          current === null
            ? nextData.teachers.map((teacher) => teacher.id)
            : current.filter((id) =>
                nextData.teachers.some((teacher) => teacher.id === id),
              ),
        );
      })
      .catch((requestError) => {
        if (currentRequest === requestId.current)
          setError(
            requestError.message || "Unable to load teacher performance.",
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
            title="Teacher performance is unavailable"
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
  const hasData = data.teachers.length > 0;
  const schoolYearOptions = data.availableSchoolYears.map((year) => ({
    value: year.value,
    label: year.label,
  }));
  const rankedTeachers = data.teachers
    .filter((teacher) => matchesTeacher(teacher, rankingQuery))
    .sort((a, b) => b.averageGrade - a.averageGrade);
  const submissionTeachers = data.teachers.filter((teacher) =>
    matchesTeacher(teacher, submissionQuery),
  );
  const chartTeachers = data.teachers.filter((teacher) =>
    matchesTeacher(teacher, chartQuery),
  );
  const selectedChartTeachers = chartTeachers.filter((teacher) =>
    selectedTeacherIds?.includes(teacher.id),
  );
  const cards = [
    {
      label: "Total Teachers",
      value: data.summary.totalTeachers,
      description: "Included in this view",
      icon: Users,
      tone: "navy",
    },
    {
      label: "Submitted Reports",
      value: data.summary.submittedReports,
      description: "Completed grading reports",
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "Overall Fail Rate",
      value: `${data.summary.failRate}%`,
      description: "Across assigned classes",
      icon: AlertTriangle,
      tone: "red",
    },
    {
      label: "Needs Attention",
      value: data.summary.needsAttention,
      description: "Teachers or reports to review",
      icon: UserCheck,
      tone: "gold",
    },
  ];
  const columns = [
    { key: "name", label: "Teacher" },
    { key: "subject", label: "Subject" },
    {
      key: "assignments",
      label: "Assigned Classes",
      render: (row) => row.assignments.join(", "),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <PerformanceStatusBadge value={row.status} />,
    },
    {
      key: "completion",
      label: "Completion",
      render: (row) => (
        <PerformanceInlineProgress
          value={row.completion}
          tone={
            row.status === "Submitted"
              ? "green"
              : row.status === "Delayed"
                ? "red"
                : "gold"
          }
        />
      ),
    },
  ];

  return (
    <main className="pa-page pp-page">
      <header className="pa-page-header">
        <div>
          <div className="pa-title-row">
            <h1>Performance by Teacher</h1>
            {import.meta.env.DEV && (
              <span className="pa-preview-badge">Preview data</span>
            )}
          </div>
          <p>
            Review class performance and grading-report completion by teacher.
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
              icon={Users}
              title="No teacher results"
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
            <RankedProgressList
              title="Performance Rate per Teacher"
              subtitle="Average grade across each teacher's assigned classes."
              items={rankedTeachers
                .map((teacher) => ({
                  id: teacher.id,
                  label: teacher.name,
                  value: teacher.averageGrade,
                  tone:
                    teacher.averageGrade < 75
                      ? "danger"
                      : teacher.averageGrade < 80
                        ? "warning"
                        : "success",
                }))}
              maxItems={10}
              viewportItems={Math.min(data.teachers.length, 10)}
              headerAction={
                <PerformanceSearch
                  value={rankingQuery}
                  onChange={setRankingQuery}
                  placeholder="Search teachers…"
                  label="Search teacher performance ranking"
                  disabled={isFiltering}
                />
              }
              emptyMessage="No teachers match your ranking search."
            />
            <PerformanceProgressTable
              title="Submission Monitor"
              subtitle="Grading-report completion by teacher and assigned classes."
              columns={columns}
              data={submissionTeachers}
              maxVisibleRows={10}
              viewportRows={Math.min(data.teachers.length, 10)}
              controls={
                <PerformanceSearch
                  value={submissionQuery}
                  onChange={setSubmissionQuery}
                  placeholder="Search monitor…"
                  label="Search submission monitor"
                  disabled={isFiltering}
                />
              }
              emptyMessage="No teachers match your submission-monitor search."
            />
            <section className="pa-panel">
              <div className="pa-panel__header">
                <div>
                  <h2>Class Average by Teacher</h2>
                  <p>Average-grade movement across all three terms.</p>
                </div>
                <div className="pp-panel-controls">
                  <PerformanceSearch
                    value={chartQuery}
                    onChange={setChartQuery}
                    placeholder="Search chart…"
                    label="Search class-average teachers"
                    disabled={isFiltering}
                  />
                </div>
              </div>
              <SubjectLegend
                className="pp-teacher-legend"
                subjects={chartTeachers.map((teacher) => ({
                  id: teacher.id,
                  code: teacher.name,
                  color: teacher.color,
                }))}
                selectedIds={selectedTeacherIds || []}
                onToggle={(id) =>
                  setSelectedTeacherIds((current) =>
                    current.includes(id)
                      ? current.filter((teacherId) => teacherId !== id)
                      : [...current, id],
                  )
                }
                onAll={() =>
                  setSelectedTeacherIds(
                    data.teachers.map((teacher) => teacher.id),
                  )
                }
                onNone={() => setSelectedTeacherIds([])}
              />
              {selectedChartTeachers.length ? <LineChart
                labels={["Term 1", "Term 2", "Term 3"]}
                selectedIndex={
                  term === "overall" ? undefined : Number(term.at(-1)) - 1
                }
                ariaLabel="Class average grade trend by teacher"
                series={selectedChartTeachers.map((teacher) => ({
                  id: teacher.id,
                  label: teacher.name,
                  color: teacher.color,
                  values: teacher.termAverages.map((value) => ({
                    value,
                    detail: `${teacher.learnerCount} learners`,
                  })),
                }))}
              /> : (
                <div className="pa-empty-chart">
                  <div className="pa-empty-chart__graph" aria-hidden="true">
                    <LineChart
                      ariaLabel="Empty teacher trend chart"
                      labels={["Term 1", "Term 2", "Term 3"]}
                      series={[]}
                    />
                  </div>
                  <div className="pa-empty-chart__message" role="status">
                    {chartTeachers.length
                      ? "Select at least one teacher to display the class-average trend."
                      : "No teachers match your chart search."}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
