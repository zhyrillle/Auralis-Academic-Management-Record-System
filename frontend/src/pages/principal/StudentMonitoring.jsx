import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, BookOpen, CalendarCheck2, ClipboardList, Info, MinusCircle, Search, X } from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import FilterToolbar from "../../components/common/FilterToolbar";
import PageSkeleton, {
  SkeletonCards,
  SkeletonChart,
  SkeletonTable,
} from "../../components/common/PageSkeleton";
import OverallDistributionChart from "../../components/at-risk/OverallDistributionChart";
import GradeLevelBreakdownChart from "../../components/at-risk/GradeLevelBreakdownChart";
import AnalyticsStatCard from "./analytics/AnalyticsStatCard";
import useStudentMonitoring from "../../services/useStudentMonitoring";
import "../../styles/atRiskPrediction.css";
import "../../styles/atRiskBreakdown.css";
import "../../styles/principalAnalytics.css";
import "../../styles/studentMonitoring.css";

const bands = [
  {
    value: "low",
    label: "Low",
    color: "#168449",
    tone: "green",
    icon: AlertCircle,
    range: "Preview grade 80 or above",
  },
  {
    value: "moderate",
    label: "Moderate",
    color: "#C27C20",
    tone: "gold",
    icon: MinusCircle,
    range: "Preview grade 75 to below 80",
  },
  {
    value: "high",
    label: "High",
    color: "#C62828",
    tone: "red",
    icon: AlertTriangle,
    range: "Preview grade below 75",
  },
];
const format = (value) =>
  value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const sourceDate = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
const componentName = (code) =>
  ({ WW: "Written Work", PT: "Performance Tasks", EX: "Examinations" })[code];

function Band({ academic }) {
  const band = bands.find((row) => row.value === academic.riskLevel);
  return (
    <span className={`sm-band sm-band--${academic.riskLevel || "pending"}`}>
      {band
        ? band.label
        : academic.status === "review"
          ? "Review records"
          : "No recorded scores"}
    </span>
  );
}

function Attendance({ value }) {
  if (!value.recordedDays)
    return <span title={value.reason}>Records needed</span>;
  return (
    <>
      <span>
        {value.absentDays} absent · {value.lateDays} late
      </span>
      <small>
        {value.recordedDays} recorded / {value.classDays} elapsed school days
      </small>
      {value.status !== "available" && (
        <small className="sm-warning" title={value.reason}>
          Incomplete / review records
        </small>
      )}
    </>
  );
}

function Reading({ value }) {
  if (!value || value.status !== "available")
    return <span>Records needed</span>;
  return (
    <>
      {value.assessment ? (
        <span>
          {value.assessment.level
            .toLowerCase()
            .replace(/^./, (text) => text.toUpperCase())}
        </span>
      ) : (
        <span>
          Screening: {value.screening.earned}/{value.screening.possible}
        </span>
      )}
      <small>
        {value.assessment
          ? `Recorded ${sourceDate(value.assessment.recordedOn)}`
          : sourceDate(value.screening.date)}
      </small>
    </>
  );
}

function MonitoringCharts({ students }) {
  const assessed = students.filter(
    (row) => row.academic.status === "available",
  );
  // The shared charts call their middle series "medium"; monitoring uses Moderate.
  const chartBands = bands.map((band) => ({
    level: band.value === "moderate" ? "medium" : band.value,
    label: band.label,
    color: band.color,
  }));
  const distribution = Object.fromEntries(bands.map((band, index) => [
    chartBands[index].level,
    { count: assessed.filter((row) => row.academic.riskLevel === band.value).length },
  ]));
  distribution.totalFlagged = assessed.length;
  const grades = [...new Set(students.map((row) => row.grade))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const breakdown = grades.map((grade) => ({
    grade,
    ...Object.fromEntries(bands.map((band, index) => [
      chartBands[index].level,
      assessed.filter(
        (row) => row.grade === grade && row.academic.riskLevel === band.value,
      ).length,
    ])),
  }));
  return (
    <section className="ar-charts-row ar-charts-row--responsive" aria-label="Academic band distribution">
      <OverallDistributionChart
        data={distribution}
        labels={Object.fromEntries(chartBands.map((band) => [band.level, band.label]))}
      />
      <GradeLevelBreakdownChart
        data={breakdown}
        gradeLevels={[7, 8, 9, 10].map((value) => ({ value }))}
        bands={chartBands}
        subtitle="Academic bands · Learners awaiting records excluded"
        ariaLabel="Academic band counts by grade level"
        fillContainer
      />
    </section>
  );
}

function LearnerDetails({ student, context, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    // Closing during StrictMode's effect replay would dismiss the new selection.
    if (!dialog.open) dialog.showModal();
  }, []);
  const academic = student.academic;
  const hasAttendanceRecords = Boolean(student.attendance?.recordedDays);
  const hasReadingRecords = student.reading?.status === "available";
  return (
    <dialog
      ref={ref}
      className="sm-dialog"
      aria-labelledby="monitoring-learner-name"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current.close();
      }}
    >
      <div className="sm-dialog-content">
        <header>
          <div>
            <span className="sm-eyebrow">Learner review</span>
            <h2 id="monitoring-learner-name">{student.name}</h2>
            <div className="sm-review-meta">
              <p>
                G{student.grade} · {student.section} · {context.subject} · Term{" "}
                {context.term.slice(1)}
              </p>
              <Band academic={academic} />
            </div>
          </div>
          <button
            type="button"
            className="sm-icon-button"
            aria-label="Close learner details"
            onClick={() => ref.current.close()}
          >
            <X size={20} />
          </button>
        </header>
        <div className="sm-review-section-title">
          <h3>Academic summary</h3>
          <details className="sm-info">
            <summary
              className="sm-icon-button"
              aria-label="How the grade preview is calculated"
              title="How the grade preview is calculated"
            >
              <Info size={18} aria-hidden="true" />
            </summary>
            <div className="sm-info-content">
              <strong>How this preview works</strong>
              <p>
                Only recorded scores are included. A confirmed missing submission
                contributes zero; an unrecorded score remains unknown. Future activities
                and excused work are excluded. Represented weight is not the percentage
                of the term completed. Examination stages contribute their recorded
                share; MAPEH previews its two components separately.
              </p>
              <p>
                Possible is the combined maximum score of the included activities.
                The count below each component shows how many activities contribute
                to these totals.
              </p>
              <p>
                The band uses the converted preview: below 75 is High; 75 to below
                80 is Moderate; 80 or above is Low. These are monitoring rules.
              </p>
            </div>
          </details>
        </div>
        {academic.status === "available" && (
          <div className="sm-calculation">
            <div className="sm-calculation-metrics">
              <div>
                <span>Running weighted performance</span>
                <strong>{format(academic.progress)}%</strong>
              </div>
              <div>
                <span>Grade preview</span>
                <strong>{format(academic.gradePreview)}</strong>
              </div>
            </div>
          </div>
        )}
        {!!academic.reasons.length && (
          <ul className="sm-record-notes">
            {academic.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {!!academic.components.length && (
          <section className="sm-components" aria-labelledby="monitoring-components-title">
            <h3 className="sm-components-title" id="monitoring-components-title">Available scores and configured weights</h3>
            <div className="sm-table-scroll sm-review-table">
              <table className="sm-table sm-component-table" aria-labelledby="monitoring-components-title">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Earned / possible</th>
                    <th>Performance</th>
                    <th>Configured weight</th>
                    <th>Represented weight</th>
                    <th>Weighted points</th>
                  </tr>
                </thead>
                <tbody>
                  {academic.components.map((component) => (
                    <tr key={component.key}>
                      <th scope="row">
                        {component.group && <small>{component.group}</small>}
                        {componentName(component.code)}
                        <small>
                          {component.activityCount} {component.activityCount === 1 ? "activity" : "activities"} included
                        </small>
                      </th>
                      <td>
                        {component.possible
                          ? `${format(component.earned)} / ${format(component.possible)}`
                          : "Not recorded"}
                      </td>
                      <td>
                        {component.percent === null
                          ? "—"
                          : `${format(component.percent)}%`}
                      </td>
                      <td>{format(component.weight)}%</td>
                      <td>{format(component.availableWeight)}%</td>
                      <td>{format(component.weightedPoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="sm-detail-sources">
          <div>
            <h3><CalendarCheck2 size={17} aria-hidden="true" />Attendance</h3>
            {hasAttendanceRecords ? (
              <>
                <Attendance value={student.attendance} />
                {student.attendance.reason && <p>{student.attendance.reason}</p>}
                <p>
                  Section attendance through {sourceDate(context.asOf)}. Late marks
                  remain separate from absences.
                </p>
              </>
            ) : (
              <p className="sm-source-empty">Records needed</p>
            )}
          </div>
          {context.isEnglish && (
            <div>
              <h3><BookOpen size={17} aria-hidden="true" />English PHIL-IRI</h3>
              {hasReadingRecords ? (
                <>
                  <Reading value={student.reading} />
                  {student.reading.screening && (
                    <p>
                      Screening: {student.reading.screening.earned}/
                      {student.reading.screening.possible} ·{" "}
                      {sourceDate(student.reading.screening.date)}
                    </p>
                  )}
                  {student.reading.assessment && (
                    <p>
                      Oral reading: {format(student.reading.assessment.oral)}% ·
                      Comprehension:{" "}
                      {format(student.reading.assessment.comprehension)}%
                    </p>
                  )}
                  <p>
                    Available English assessments recorded by the review date.
                    Attendance and reading do not change the academic band.
                  </p>
                </>
              ) : (
                <p className="sm-source-empty">Records needed</p>
              )}
            </div>
          )}
        </section>
      </div>
    </dialog>
  );
}

export default function StudentMonitoring() {
  const view = useStudentMonitoring();
  const { data, loading, error, options, params, change } = view;
  const [selected, setSelected] = useState(null);
  const students = useMemo(() => data?.students || [], [data]);
  const grade = params.get("grade") || "all",
    section = params.get("section") || "all";
  const band = params.get("band") || "all",
    search = params.get("search") || "";
  const grades = [...new Set(students.map((row) => row.grade))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const sections = [
    ...new Map(
      students
        .filter((row) => grade === "all" || String(row.grade) === grade)
        .map((row) => [
          String(row.sectionId),
          { value: String(row.sectionId), label: row.section },
        ]),
    ).values(),
  ];
  const scoped = students.filter(
    (row) =>
      (grade === "all" || String(row.grade) === grade) &&
      (section === "all" || String(row.sectionId) === section),
  );
  const matching = scoped
    .filter(
      (row) =>
        (band === "all" ||
          (band === "pending"
            ? row.academic.status !== "available"
            : row.academic.riskLevel === band)) &&
        `${row.name} ${row.section} ${row.adviser}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((left, right) => {
      const order = { high: 0, moderate: 1, low: 2 };
      return (
        (order[left.academic.riskLevel] ?? 3) -
          (order[right.academic.riskLevel] ?? 3) ||
        left.name.localeCompare(right.name)
      );
    });
  const assessed = scoped.filter((row) => row.academic.status === "available");
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const requestedPage = Number(params.get("page"));
  const page = Math.max(
    1,
    Math.min(pages, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
  );
  const rows = matching.slice((page - 1) * 20, page * 20);
  const selectedStudent =
    selected?.key === view.key
      ? students.find((row) => row.id === selected.id)
      : null;
  const disabled = !options;
  const stats = [
    ...bands.map((item) => ({
      ...item,
      count: assessed.filter((row) => row.academic.riskLevel === item.value)
        .length,
    })),
    {
      value: "pending",
      label: "Records needed / review",
      tone: "navy",
      icon: ClipboardList,
      range: "No academic band assigned",
      count: scoped.length - assessed.length,
    },
  ];
  return (
    <div className="ar-page sm-page">
      <header className="sm-header">
        <div>
          <h1 className="ar-title">Student Monitoring</h1>
          <p className="ar-subtitle">
            Current-term academic progress · Attendance · English reading
            records
          </p>
        </div>
      </header>
      <FilterToolbar
        label="Student monitoring filters"
        className="sm-filters"
        end={<>
          <DropdownSelect
            className="sm-filter-term"
            label="Term"
            value={view.filters.term}
            placeholder="Term"
            options={view.terms}
            onChange={(value) => change("term", value)}
            disabled={disabled || !view.terms.length}
          />
          <DropdownSelect
            className="sm-filter-year"
            label="School year"
            value={view.filters.schoolYear}
            placeholder="School year"
            options={options?.schoolYears || []}
            onChange={(value) => change("schoolYear", value)}
            disabled={!options}
          />
        </>}
      >
        <DropdownSelect
          className="sm-filter-subject"
          label="Subject"
          value={view.filters.subject}
          placeholder="Subject"
          options={view.subjects}
          onChange={(value) => change("subject", value)}
          disabled={disabled || !view.subjects.length}
        />
        <DropdownSelect
          className="sm-filter-section"
          label="Section"
          value={section}
          options={[{ value: "all", label: "All sections" }, ...sections]}
          onChange={(value) => change("section", value)}
          disabled={disabled || loading}
        />
        <DropdownSelect
          className="sm-filter-grade"
          label="Grade level"
          value={grade}
          options={[
            { value: "all", label: "All grade levels" },
            ...grades.map((value) => ({
              value: String(value),
              label: `Grade ${value}`,
            })),
          ]}
          onChange={(value) => change("grade", value)}
          disabled={disabled || loading}
        />
      </FilterToolbar>
      <div className="sm-context-row">
        <p className="sm-context">
          {data
            ? `${data.context.subject} · Term ${data.context.term.slice(1)} · ${data.context.schoolYear} · Records through ${sourceDate(data.context.asOf)}`
            : "Choose a subject, term, and school year to review recorded progress."}
        </p>
        {data && !loading && (
          <details className="sm-info">
            <summary
              className="sm-icon-button"
              aria-label="About grade previews and academic bands"
              title="About grade previews and academic bands"
            >
              <Info size={18} aria-hidden="true" />
            </summary>
            <div className="sm-info-content">
              <strong>About these bands</strong>
              <p>
                <strong>{assessed.length} of {scoped.length} learners</strong> have
                a grade preview. Bands update from recorded scores and available
                component weights; they are not official term grades. Attendance
                and English PHIL-IRI are reviewed separately.
              </p>
            </div>
          </details>
        )}
      </div>
      {error && (
        <div className="sm-error" role="alert">
          <strong>
            {data
              ? "The update could not be completed."
              : "Student monitoring unavailable."}
          </strong>
          <p>{error}</p>
          <button type="button" onClick={view.retry}>
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <PageSkeleton label="Loading student monitoring">
          <SkeletonCards count={4} />
          <div className="ar-charts-row ar-charts-row--responsive">
            <SkeletonChart round />
            <SkeletonChart />
          </div>
          <SkeletonTable rows={7} columns={7} />
        </PageSkeleton>
      ) : view.optionsEmpty ? (
        <div className="sm-panel sm-empty">
          <ClipboardList />
          <h2>No configured monitoring context</h2>
          <p>
            A school year, term, and subject offering are needed before
            monitoring can begin.
          </p>
        </div>
      ) : (
        data && (
          <>
            <section
              className="ar-stats-row"
              aria-label="Academic monitoring summary"
            >
              {stats.map((item) => (
                <AnalyticsStatCard
                  key={item.value}
                  label={item.label}
                  value={item.count}
                  description={item.range}
                  tone={item.tone}
                  icon={item.icon}
                />
              ))}
            </section>
            <MonitoringCharts students={scoped} />
            <section className="sm-panel sm-learners">
              <div className="sm-list-header">
                <div>
                  <h2>Learner monitoring</h2>
                  <p>
                    Ordered by academic priority. Review the records and
                    calculation behind each academic band.
                  </p>
                </div>
                <div className="sm-list-controls">
                  <DropdownSelect
                    label="Academic band"
                    value={band}
                    options={[
                      { value: "all", label: "All learners" },
                      ...bands,
                      { value: "pending", label: "Records needed / review" },
                    ]}
                    onChange={(value) => change("band", value)}
                  />
                  <label className="sm-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      aria-label="Search learners"
                      placeholder="Search name, section, adviser…"
                      value={search}
                      onChange={(event) => change("search", event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="sm-table-scroll">
                <table className="sm-table">
                  <thead>
                    <tr>
                      <th>Learner</th>
                      <th>Academic band</th>
                      <th>Running performance</th>
                      <th>Grade preview</th>
                      <th>Evidence</th>
                      <th>Attendance</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((student) => (
                      <tr key={student.id}>
                        <th scope="row">
                          {student.name}
                          <small>
                            G{student.grade} · {student.section}
                          </small>
                          <small>Adviser: {student.adviser}</small>
                        </th>
                        <td>
                          <Band academic={student.academic} />
                        </td>
                        <td>
                          {student.academic.progress === null
                            ? "—"
                            : `${format(student.academic.progress)}%`}
                        </td>
                        <td>{format(student.academic.gradePreview)}</td>
                        <td>
                          {student.academic.recordedActivities} recorded
                          <small>
                            {format(student.academic.availableWeight)}%
                            component weight represented
                          </small>
                          {student.academic.pendingActivities > 0 && (
                            <small>
                              {student.academic.pendingActivities} score(s)
                              unrecorded
                            </small>
                          )}
                        </td>
                        <td>
                          <Attendance value={student.attendance} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sm-detail-button"
                            aria-label={`Review ${student.name}`}
                            onClick={() =>
                              setSelected({ key: view.key, id: student.id })
                            }
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && (
                <p className="sm-empty">
                  {students.length
                    ? "No learners match these filters."
                    : "No enrolled learners are available for this subject and school year."}
                </p>
              )}
              <footer className="sm-pagination">
                <span>
                  {matching.length} learners · Page {page} of {pages}
                </span>
                <div>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => change("page", String(page - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= pages}
                    onClick={() => change("page", String(page + 1))}
                  >
                    Next
                  </button>
                </div>
              </footer>
            </section>
          </>
        )
      )}
      {selectedStudent && data && (
        <LearnerDetails
          key={`${view.key}:${selectedStudent.id}`}
          student={selectedStudent}
          context={data.context}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
